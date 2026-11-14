import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import {
  createChangeStreamManager,
  isUnrecoverableChangeStreamError,
} from "../src/vote/send-vote.mjs";

const wait = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const createHarness = () => {
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
    onChange: (change) => {
      logs.push({ type: "change", change });
    },
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

test("normal Change Stream events are processed", async () => {
  const { manager, streams, logs } = createHarness();

  try {
    manager.start();
    const change = { _id: { token: 1 }, fullDocument: { presenting: true } };
    streams[0].emit("change", change);

    assert.deepEqual(logs.find(({ type }) => type === "change"), {
      type: "change",
      change,
    });
  } finally {
    await manager.shutdown();
  }
});

test("transient errors reconnect without terminating the process", async () => {
  const { manager, streams, logs } = createHarness();

  try {
    manager.start();
    streams[0].emit("error", new Error("temporary network interruption"));
    await wait(15);

    assert.equal(streams.length, 2);
    assert.equal(logs.some(({ type }) => type === "warn"), true);
  } finally {
    await manager.shutdown();
  }
});

test("closed streams are recreated with the latest resume token", async () => {
  const { manager, streams } = createHarness();

  try {
    manager.start();
    const resumeToken = { token: 2 };
    streams[0].emit("change", { _id: resumeToken, fullDocument: {} });
    streams[0].emit("close");
    await wait(15);

    assert.equal(streams.length, 2);
    assert.deepEqual(streams[1].options.resumeAfter, resumeToken);
  } finally {
    await manager.shutdown();
  }
});

test("multiple failures schedule only one reconnect", async () => {
  const { manager, streams } = createHarness();

  try {
    manager.start();
    streams[0].emit("error", new Error("network interruption"));
    streams[0].emit("error", new Error("second network interruption"));
    streams[0].emit("close");
    await wait(15);

    assert.equal(streams.length, 2);
  } finally {
    await manager.shutdown();
  }
});

test("shutdown closes the stream and prevents reconnection", async () => {
  const { manager, streams } = createHarness();

  manager.start();
  streams[0].emit("error", new Error("temporary failure"));
  await manager.shutdown();
  await wait(15);

  assert.equal(streams.length, 1);
  assert.equal(streams[0].closed, true);
});

test("unrecoverable errors are surfaced without retrying", async () => {
  const { manager, streams, logs } = createHarness();
  const error = Object.assign(new Error("authentication failed"), {
    code: 18,
  });

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
