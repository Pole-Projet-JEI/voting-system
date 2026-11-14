import assert from "node:assert/strict";
import { test } from "node:test";
import { createSseConnection } from "../src/service/sseConnection.js";

class FakeEventSource {
  constructor() {
    this.closed = false;
    this.onopen = null;
    this.onmessage = null;
    this.onerror = null;
  }

  close() {
    this.closed = true;
  }
}

const createHarness = (options = {}) => {
  const sources = [];
  const timers = [];
  const clearedTimers = [];
  const listeners = new Map();
  const documentRef = {
    visibilityState: "visible",
    addEventListener(name, listener) {
      listeners.set(name, listener);
    },
    removeEventListener(name, listener) {
      if (listeners.get(name) === listener) {
        listeners.delete(name);
      }
    },
  };
  const connection = createSseConnection({
    url: "/api/sendvote",
    onMessage: async () => {},
    eventSourceFactory: () => {
      const source = new FakeEventSource();
      sources.push(source);
      return source;
    },
    documentRef,
    setTimeoutFn: (callback, delay) => {
      const timer = { callback, delay, cleared: false };
      timers.push(timer);
      return timer;
    },
    clearTimeoutFn: (timer) => {
      timer.cleared = true;
      clearedTimers.push(timer);
    },
    random: () => 0,
    logger: { error() {} },
    ...options,
  });

  return { connection, sources, timers, clearedTimers, listeners };
};

test("SSE errors schedule reconnection instead of reloading", () => {
  const { connection, sources, timers } = createHarness();

  connection.start();
  sources[0].onerror();

  assert.equal(sources[0].closed, true);
  assert.equal(timers.length, 1);
  assert.equal(sources.length, 1);
});

test("reconnection delay increases exponentially", () => {
  const { connection, sources, timers } = createHarness();

  connection.start();
  sources[0].onerror();
  timers[0].callback();
  sources[1].onerror();

  assert.equal(timers[0].delay, 500);
  assert.equal(timers[1].delay, 1000);
});

test("reconnection jitter is applied and capped", () => {
  const { connection, sources, timers } = createHarness({
    random: () => 0.25,
    initialDelayMs: 1000,
    maxDelayMs: 1500,
  });

  connection.start();
  sources[0].onerror();
  assert.equal(timers[0].delay, 750);

  timers[0].callback();
  sources[1].onerror();
  timers[1].callback();
  sources[2].onerror();
  assert.equal(timers[2].delay, 1125);
  timers[2].callback();
  sources[3].onerror();
  assert.equal(timers[3].delay, 1125);
  assert.equal(timers[3].delay <= 1500, true);
});

test("only one EventSource is active per connection", () => {
  const { connection, sources, timers } = createHarness();

  connection.start();
  connection.start();
  sources[0].onerror();
  sources[0].onerror();

  assert.equal(sources.length, 1);
  assert.equal(timers.length, 1);
});

test("cleanup closes the EventSource, clears timers, and removes visibility listener", () => {
  const { connection, sources, timers, clearedTimers, listeners } =
    createHarness();

  connection.start();
  sources[0].onerror();
  connection.stop();

  assert.equal(sources[0].closed, true);
  assert.equal(clearedTimers[0], timers[0]);
  assert.equal(listeners.has("visibilitychange"), false);
});

test("unmounted connections do not reconnect", () => {
  const { connection, sources, timers } = createHarness();

  connection.start();
  sources[0].onerror();
  connection.stop();
  timers[0].callback();

  assert.equal(sources.length, 1);
});

test("stale async message callbacks are inactive after cleanup", async () => {
  let resolveMessage;
  let isActive;
  const message = new Promise((resolve) => {
    resolveMessage = resolve;
  });
  const { connection, sources } = createHarness({
    onMessage: async (_event, active) => {
      isActive = active;
      await message;
    },
  });

  connection.start();
  sources[0].onmessage({ data: "{}" });
  await Promise.resolve();
  connection.stop();
  resolveMessage();
  await message;

  assert.equal(isActive(), false);
});

test("visibility changes do not create duplicate connections", () => {
  const { connection, sources, listeners } = createHarness();

  connection.start();
  listeners.get("visibilitychange")();

  assert.equal(sources.length, 1);
});
