import assert from "node:assert/strict";
import { test } from "node:test";
import { getCurrentLocation, parseCoordinatePair } from "../src/service/geolocation.js";

const withGeolocation = async (responses, fn) => {
  const calls = [];
  globalThis.window = { isSecureContext: true };
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      geolocation: {
        getCurrentPosition(ok, fail, options) {
          calls.push(options);
          const next = responses.shift();
          next.error ? fail({ code: next.error }) : ok({ coords: next });
        },
      },
    },
  });
  try {
    await fn(calls);
  } finally {
    delete globalThis.window;
    delete globalThis.navigator;
  }
};

test("precise fix is used when available", async () => {
  await withGeolocation([{ latitude: 1, longitude: 2, accuracy: 10 }], async (calls) => {
    const result = await getCurrentLocation();
    assert.equal(result.success, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].enableHighAccuracy, true);
  });
});

test("laptop without GPS: timeout falls back to normal location", async () => {
  await withGeolocation([{ error: 3 }, { latitude: 1, longitude: 2, accuracy: 60 }], async (calls) => {
    const result = await getCurrentLocation();
    assert.equal(result.success, true);
    assert.equal(calls.length, 2);
    assert.equal(calls[1].enableHighAccuracy, false);
  });
});

test("position unavailable also falls back", async () => {
  await withGeolocation([{ error: 2 }, { latitude: 1, longitude: 2, accuracy: 60 }], async () => {
    assert.equal((await getCurrentLocation()).success, true);
  });
});

test("blocked permission does not retry and explains how to fix it", async () => {
  await withGeolocation([{ error: 1 }], async (calls) => {
    const result = await getCurrentLocation();
    assert.equal(result.errorCode, "PERMISSION_DENIED");
    assert.match(result.error, /Allow/);
    assert.equal(calls.length, 1);
  });
});

test("coordinates copied from Google Maps are parsed", () => {
  assert.deepEqual(parseCoordinatePair("36.842563, 10.197510"), { latitude: 36.842563, longitude: 10.19751 });
  assert.deepEqual(parseCoordinatePair("36.84 10.19"), { latitude: 36.84, longitude: 10.19 });
  assert.equal(parseCoordinatePair("36.8"), null);
  assert.equal(parseCoordinatePair("95, 10"), null);
});
