import { Router } from "express";
import Team from "../mongodb/teamSchema.mjs";

const route = Router();
const pipeline = [
  {
    $match: {
      "updateDescription.updatedFields.presenting": { $exists: true },
    },
  },
];
const streamOptions = {
  fullDocument: "updateLookup",
};
const MAX_RECONNECT_DELAY_MS = 30_000;
const INITIAL_RECONNECT_DELAY_MS = 250;
const UNRECOVERABLE_ERROR_CODES = new Set([13, 18, 26, 73]);

const describeError = (error) => ({
  message: error?.message || "Unknown change stream error",
  code: error?.code,
  codeName: error?.codeName,
});

export const isUnrecoverableChangeStreamError = (error) =>
  error?.hasErrorLabel?.("NonResumableChangeStreamError") ||
  UNRECOVERABLE_ERROR_CODES.has(error?.code);

export const createChangeStreamManager = ({
  createStream,
  onChange,
  logger = console,
  random = Math.random,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  initialDelayMs = INITIAL_RECONNECT_DELAY_MS,
  maxDelayMs = MAX_RECONNECT_DELAY_MS,
}) => {
  let stream = null;
  let reconnectTimer = null;
  let reconnectAttempt = 0;
  let resumeToken = null;
  let shuttingDown = false;

  const closeStream = async (streamToClose) => {
    if (!streamToClose?.close) {
      return;
    }

    try {
      await streamToClose.close();
    } catch (error) {
      logger.error("Change Stream close failed", describeError(error));
    }
  };

  const scheduleReconnect = () => {
    if (shuttingDown || reconnectTimer) {
      return;
    }

    reconnectAttempt += 1;
    const exponentialDelay = Math.min(
      maxDelayMs,
      initialDelayMs * 2 ** (reconnectAttempt - 1)
    );
    const jitter = 0.5 + random();
    const delay = Math.min(maxDelayMs, Math.round(exponentialDelay * jitter));

    reconnectTimer = setTimer(() => {
      reconnectTimer = null;
      openStream();
    }, delay);
  };

  const handleFailure = (streamWithFailure, error) => {
    if (shuttingDown || stream !== streamWithFailure) {
      return;
    }

    stream = null;

    if (isUnrecoverableChangeStreamError(error)) {
      logger.error(
        "Unrecoverable Change Stream error; reconnect disabled",
        describeError(error)
      );
      return;
    }

    logger.warn(
      "Recoverable Change Stream error; scheduling reconnect",
      describeError(error)
    );
    void closeStream(streamWithFailure);
    scheduleReconnect();
  };

  const attachListeners = (streamToAttach) => {
    streamToAttach.on("change", (change) => {
      if (change?._id) {
        resumeToken = change._id;
      }

      try {
        const result = onChange(change);
        if (result?.catch) {
          result.catch((error) => {
            logger.error("Change Stream event processing failed", describeError(error));
          });
        }
      } catch (error) {
        logger.error("Change Stream event processing failed", describeError(error));
      }
    });
    streamToAttach.on("error", (error) => {
      handleFailure(streamToAttach, error);
    });
    streamToAttach.on("close", () => {
      handleFailure(streamToAttach);
    });
  };

  function openStream() {
    if (shuttingDown || stream) {
      return;
    }

    try {
      const options = resumeToken
        ? { ...streamOptions, resumeAfter: resumeToken }
        : streamOptions;
      const nextStream = createStream(options);
      stream = nextStream;
      reconnectAttempt = 0;
      attachListeners(nextStream);
      logger.info("MongoDB Change Stream connected");
    } catch (error) {
      if (isUnrecoverableChangeStreamError(error)) {
        logger.error(
          "Unrecoverable Change Stream creation error",
          describeError(error)
        );
        return;
      }

      logger.warn(
        "Change Stream creation failed; scheduling reconnect",
        describeError(error)
      );
      scheduleReconnect();
    }
  }

  return {
    start() {
      shuttingDown = false;
      openStream();
    },
    async shutdown() {
      shuttingDown = true;
      if (reconnectTimer) {
        clearTimer(reconnectTimer);
        reconnectTimer = null;
      }

      const streamToClose = stream;
      stream = null;
      await closeStream(streamToClose);
    },
  };
};

const clients = new Set();

const broadcastChange = (change) => {
  let data;
  if (change.fullDocument?.presenting === true) {
    data = JSON.stringify({
      teamID: change.fullDocument._id,
      teamName: change.fullDocument.teamName,
      description: change.fullDocument.description,
    });
  } else if (change.fullDocument?.presenting === false) {
    data = JSON.stringify({ teamID: null, teamName: null, stopped: true });
  }

  if (data) {
    clients.forEach((client) => {
      try {
        client.write(`data: ${data}\n\n`);
      } catch (error) {
        console.error("Error writing to client:", error.message || error);
        clients.delete(client);
      }
    });
  }
};

const streamManager = createChangeStreamManager({
  createStream: (options) => Team.watch(pipeline, options),
  onChange: broadcastChange,
});

export const initializeChangeStream = () => streamManager.start();
export const shutdownChangeStream = () => streamManager.shutdown();

route.get("/api/sendvote", async (req, res) => {
  try {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    clients.add(res);
    console.log(`Client connected. Total clients: ${clients.size}`);
    res.write(`data: ${JSON.stringify({ connected: true })}\n\n`);

    req.on("close", () => {
      clients.delete(res);
      console.log(`Client disconnected. Total clients: ${clients.size}`);
      res.end();
    });
  } catch (error) {
    console.error("Error in /api/sendvote:", error);
    return res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
});

export default route;
