import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import {
  createChangeStreamManager,
  createSseClientRegistry,
  isUnrecoverableChangeStreamError,
} from "../src/vote/send-vote.mjs";

const wait = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const createResponse = () => {
  const response = new EventEmitter();
  response.writes = [];
  response.write = (value) => {
    response.writes.push(value);
    return true;
  };
  return response;
};

const createRegistryHarness = (options = {}) => {
  const intervals = [];
  const cleared = [];
  const registry = createSseClientRegistry({
    heartbeatIntervalMs: 10,
    setIntervalFn: (callback) => {
      intervals.push(callback);
      return callback;
    },
    clearIntervalFn: (timer) => cleared.push(timer),
    logger: { error() {} },
    ...options,
  });
  return { registry, intervals, cleared };
};

test("SSE clients receive heartbeat messages", () => {
  const { registry, intervals } = createRegistryHarness();
  const request = new EventEmitter();
  const response = createResponse();

  assert.equal(registry.add(request, response), true);
  intervals[0]();

  assert.deepEqual(response.writes, [": heartbeat\n\n"]);
});

test("disconnect removes an SSE client and clears its heartbeat", () => {
  const { registry, intervals, cleared } = createRegistryHarness();
  const request = new EventEmitter();
  const response = createResponse();

  registry.add(request, response);
  request.emit("close");
  intervals[0]();

  assert.equal(registry.size, 0);
  assert.equal(cleared.length, 1);
});

test("repeated disconnect events perform cleanup once", () => {
  const { registry, cleared } = createRegistryHarness();
  const request = new EventEmitter();
  const response = createResponse();

  registry.add(request, response);
  request.emit("close");
  response.emit("close");
  response.emit("error", new Error("already disconnected"));

  assert.equal(registry.size, 0);
  assert.equal(cleared.length, 1);
});

test("connection limits reject excess clients", () => {
  const { registry } = createRegistryHarness({ maxConnections: 1 });
  const firstRequest = new EventEmitter();
  const firstResponse = createResponse();
  const secondRequest = new EventEmitter();
  const secondResponse = createResponse();

  assert.equal(registry.add(firstRequest, firstResponse), true);
  assert.equal(registry.add(secondRequest, secondResponse), false);
  assert.equal(registry.size, 1);
});

test("a broken client does not prevent other clients receiving broadcasts", () => {
  const { registry } = createRegistryHarness();
  const brokenRequest = new EventEmitter();
  const brokenResponse = createResponse();
  brokenResponse.write = () => {
    throw new Error("disconnected");
  };
  const healthyRequest = new EventEmitter();
  const healthyResponse = createResponse();

  registry.add(brokenRequest, brokenResponse);
  registry.add(healthyRequest, healthyResponse);
  registry.broadcast(JSON.stringify({ teamID: "team-id" }));

  assert.equal(registry.size, 1);
  assert.equal(healthyResponse.writes.length, 1);
});

const createStreamHarness = () => {
  const streams = [];
  const logs = [];
  const manager = createChangeStreamManager({
    createStream: (options) => {
      const stream = new EventEmitter();
      stream.options = options;
      stream.close = async () => {
        stream.closed = true;
      };
      streams.push(stream);
      return stream;
    },
    onChange: (change) => logs.push(change),
    logger: {
      info: (...args) => logs.push({ type: "info", args }),
      warn: (...args) => logs.push({ type: "warn", args }),
      error: (...args) => logs.push({ type: "error", args }),
    },
    random: () => 0,
    initialDelayMs: 5,
    maxDelayMs: 20,
  });

  return { manager, streams, logs };
};

test("change stream events are processed and transient failures reconnect", async () => {
  const { manager, streams, logs } = createStreamHarness();

  try {
    manager.start();
    const change = { _id: { token: 1 }, fullDocument: { presenting: true } };
    streams[0].emit("change", change);
    streams[0].emit("error", new Error("temporary network interruption"));
    await wait(15);

    assert.equal(logs.includes(change), true);
    assert.equal(streams.length, 2);
  } finally {
    await manager.shutdown();
  }
});

test("closed streams resume from the latest token and repeated failures do not duplicate reconnects", async () => {
  const { manager, streams } = createStreamHarness();

  try {
    manager.start();
    const resumeToken = { token: 2 };
    streams[0].emit("change", { _id: resumeToken, fullDocument: {} });
    streams[0].emit("error", new Error("network interruption"));
    streams[0].emit("error", new Error("second network interruption"));
    streams[0].emit("close");
    await wait(15);

    assert.equal(streams.length, 2);
    assert.deepEqual(streams[1].options.resumeAfter, resumeToken);
  } finally {
    await manager.shutdown();
  }
});

test("change stream shutdown prevents reconnection", async () => {
  const { manager, streams } = createStreamHarness();

  manager.start();
  streams[0].emit("error", new Error("temporary failure"));
  await manager.shutdown();
  await wait(15);

  assert.equal(streams.length, 1);
  assert.equal(streams[0].closed, true);
});

test("unrecoverable change stream errors are surfaced without retrying", async () => {
  const { manager, streams, logs } = createStreamHarness();
  const error = Object.assign(new Error("authentication failed"), { code: 18 });

  try {
    manager.start();
    streams[0].emit("error", error);
    await wait(15);

    assert.equal(streams.length, 1);
    assert.equal(logs.some(({ type }) => type === "error"), true);
    assert.equal(isUnrecoverableChangeStreamError(error), true);
  } finally {
    await manager.shutdown();
  }
});
