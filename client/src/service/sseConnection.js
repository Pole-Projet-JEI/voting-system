export const SSE_INITIAL_RECONNECT_DELAY_MS = 1000;
export const SSE_MAX_RECONNECT_DELAY_MS = 30_000;

export const createSseConnection = ({
  url,
  onMessage,
  eventSourceFactory = (sourceUrl, options) =>
    new EventSource(sourceUrl, options),
  documentRef =
    typeof document === "undefined" ? null : document,
  random = Math.random,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
  initialDelayMs = SSE_INITIAL_RECONNECT_DELAY_MS,
  maxDelayMs = SSE_MAX_RECONNECT_DELAY_MS,
  logger = console,
}) => {
  let eventSource = null;
  let reconnectTimer = null;
  let retryAttempt = 0;
  let stopped = true;

  const scheduleReconnect = () => {
    if (stopped || reconnectTimer) {
      return;
    }

    retryAttempt += 1;
    const exponentialDelay = Math.min(
      maxDelayMs,
      initialDelayMs * 2 ** (retryAttempt - 1)
    );
    const jitteredDelay = exponentialDelay * (0.5 + random());
    const delay = Math.min(maxDelayMs, Math.round(jitteredDelay));

    reconnectTimer = setTimeoutFn(() => {
      reconnectTimer = null;
      connect();
    }, delay);
  };

  const handleVisibilityChange = () => {
    if (
      documentRef?.visibilityState === "visible" &&
      !eventSource &&
      !reconnectTimer
    ) {
      scheduleReconnect();
    }
  };

  const connect = () => {
    if (stopped || eventSource) {
      return;
    }

    const nextEventSource = eventSourceFactory(url, {
      withCredentials: true,
    });
    eventSource = nextEventSource;

    nextEventSource.onopen = () => {
      if (!stopped && eventSource === nextEventSource) {
        retryAttempt = 0;
      }
    };

    nextEventSource.onmessage = (event) => {
      if (stopped || eventSource !== nextEventSource) {
        return;
      }

      Promise.resolve()
        .then(() =>
          onMessage(event, () => !stopped && eventSource === nextEventSource)
        )
        .then(() => {
          if (!stopped && eventSource === nextEventSource) {
            retryAttempt = 0;
          }
        })
        .catch((error) => {
          logger.error("Error processing SSE message:", error);
        });
    };

    nextEventSource.onerror = () => {
      if (stopped || eventSource !== nextEventSource) {
        return;
      }

      nextEventSource.close();
      eventSource = null;
      scheduleReconnect();
    };
  };

  const start = () => {
    if (!stopped) {
      return;
    }

    stopped = false;
    documentRef?.addEventListener("visibilitychange", handleVisibilityChange);
    connect();
  };

  const stop = () => {
    stopped = true;
    if (reconnectTimer) {
      clearTimeoutFn(reconnectTimer);
      reconnectTimer = null;
    }

    if (eventSource) {
      const sourceToClose = eventSource;
      eventSource = null;
      sourceToClose.close();
    }

    documentRef?.removeEventListener(
      "visibilitychange",
      handleVisibilityChange
    );
  };

  return {
    start,
    stop,
    get retryAttempt() {
      return retryAttempt;
    },
  };
};
