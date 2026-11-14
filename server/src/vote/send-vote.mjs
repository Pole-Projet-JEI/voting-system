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
const streamOptions = { fullDocument: "updateLookup" };
const INITIAL_RECONNECT_DELAY_MS = 250;
const MAX_RECONNECT_DELAY_MS = 30_000;
const UNRECOVERABLE_ERROR_CODES = new Set([13, 18, 26, 73]);

const parsePositiveInteger = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

export const SSE_HEARTBEAT_INTERVAL_MS = parsePositiveInteger(
  process.env.SSE_HEARTBEAT_INTERVAL_MS,
  25_000
);
export const SSE_MAX_CONNECTIONS = parsePositiveInteger(
  process.env.SSE_MAX_CONNECTIONS,
  100
);

const describeError = (error) => ({
  message: error?.message || "Unknown error",
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
    const jitteredDelay = exponentialDelay * (0.5 + random());
    const delay = Math.min(maxDelayMs, Math.round(jitteredDelay));

    reconnectTimer = setTimer(() => {
      reconnectTimer = null;
      openStream();
    }, delay);
  };

  const handleFailure = (failedStream, error) => {
    if (shuttingDown || stream !== failedStream) {
      return;
    }

    stream = null;
    void closeStream(failedStream);

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
            logger.error(
              "Change Stream event processing failed",
              describeError(error)
            );
          });
        }
      } catch (error) {
        logger.error(
          "Change Stream event processing failed",
          describeError(error)
        );
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

export const createSseClientRegistry = ({
  maxConnections = SSE_MAX_CONNECTIONS,
  heartbeatIntervalMs = SSE_HEARTBEAT_INTERVAL_MS,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
  logger = console,
} = {}) => {
  const clients = new Map();

  const remove = (response) => {
    const client = clients.get(response);
    if (!client || client.cleaned) {
      return;
    }

    client.cleaned = true;
    clearIntervalFn(client.heartbeat);
    clients.delete(response);
  };

  const add = (request, response) => {
    if (clients.size >= maxConnections) {
      return false;
    }

    const client = {
      cleaned: false,
      heartbeat: null,
    };
    const cleanup = () => remove(response);

    client.heartbeat = setIntervalFn(() => {
      if (client.cleaned) {
        return;
      }

      try {
        response.write(": heartbeat\n\n");
      } catch (error) {
        logger.error("SSE heartbeat failed", error?.message || error);
        cleanup();
      }
    }, heartbeatIntervalMs);

    clients.set(response, client);
    request.once("close", cleanup);
    response.once("close", cleanup);
    response.once("error", cleanup);
    return true;
  };

  const broadcast = (message) => {
    for (const [response] of clients) {
      try {
        response.write(`data: ${message}\n\n`);
      } catch (error) {
        logger.error("SSE broadcast failed", error?.message || error);
        remove(response);
      }
    }
  };

  return {
    add,
    broadcast,
    remove,
    get size() {
      return clients.size;
    },
  };
};

const clients = createSseClientRegistry();

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
    clients.broadcast(data);
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
    if (!clients.add(req, res)) {
      return res.status(503).json({
        message: "SSE connection limit reached",
      });
    }

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
    clients.remove(res);
    console.error("Error in /api/sendvote:", error);
    if (!res.headersSent) {
      return res
        .status(500)
        .json({ message: "Internal Server Error", error: error.message });
    }
  }
});

export default route;
