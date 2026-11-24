import assert from "node:assert/strict";
import { test } from "node:test";
import {
  detectPlatform,
  getCurrentLocation,
  getVoterLocation,
  locationMessage,
  parseCoordinatePair,
} from "../src/service/geolocation.js";

const withGeolocation = async (responses, fn, { watch = [], userAgent = "" } = {}) => {
  const calls = [];
  globalThis.window = { isSecureContext: true };
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      userAgent,
      maxTouchPoints: 0,
      geolocation: {
        getCurrentPosition(ok, fail, options) {
          calls.push({ kind: "get", ...options });
          const next = responses.shift();
          next.error ? fail({ code: next.error }) : ok({ coords: next, timestamp: Date.now() - (next.ageMs || 0) });
        },
        // Emits the queued watch readings 10 ms apart (or at next.atMs).
        watchPosition(ok, fail, options) {
          calls.push({ kind: "watch", ...options });
          watch.forEach((next, i) =>
            setTimeout(() => (next.error ? fail({ code: next.error }) : ok({ coords: next, timestamp: Date.now() })), next.atMs ?? 10 * (i + 1))
          );
          return 7;
        },
        clearWatch(id) {
          calls.push({ kind: "clear", id });
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
    assert.equal(calls[1].maximumAge, 0, "fallback must never reuse a cached position");
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
    assert.match(result.error, /bloquée/);
    assert.equal(calls.length, 1);
  });
});

test("coordinates copied from Google Maps are parsed", () => {
  assert.deepEqual(parseCoordinatePair("36.842563, 10.197510"), { latitude: 36.842563, longitude: 10.19751 });
  assert.deepEqual(parseCoordinatePair("36.84 10.19"), { latitude: 36.84, longitude: 10.19 });
  assert.equal(parseCoordinatePair("36.8"), null);
  assert.equal(parseCoordinatePair("95, 10"), null);
});

test("voter location keeps the most accurate reading and never uses the cache", async () => {
  await withGeolocation([], async (calls) => {
    const result = await getVoterLocation({ windowMs: 60, goodEnoughMeters: 5 });
    assert.equal(result.success, true);
    assert.equal(result.location.accuracy, 18);
    assert.equal(result.location.latitude, 2);
    assert.ok(result.location.ageMs >= 0 && result.location.ageMs < 1000);
    assert.equal(calls[0].kind, "watch");
    assert.equal(calls[0].enableHighAccuracy, true);
    assert.equal(calls[0].maximumAge, 0);
    assert.ok(calls.some((c) => c.kind === "clear"), "watch is stopped");
  }, { watch: [
    { latitude: 1, longitude: 1, accuracy: 45 },
    { latitude: 2, longitude: 2, accuracy: 18 },
    { latitude: 3, longitude: 3, accuracy: 30 },
  ] });
});

test("voter location stops early once the reading is good enough", async () => {
  await withGeolocation([], async () => {
    const started = Date.now();
    const result = await getVoterLocation({ windowMs: 5000, goodEnoughMeters: 20 });
    assert.equal(result.location.accuracy, 12);
    assert.ok(Date.now() - started < 1000);
  }, { watch: [{ latitude: 1, longitude: 1, accuracy: 40 }, { latitude: 1, longitude: 1, accuracy: 12 }] });
});

test("indoors: rough cell position first, precise fix later -> waits for the precise one", async () => {
  await withGeolocation([], async () => {
    const result = await getVoterLocation({ windowMs: 40, targetMeters: 60, timeoutMs: 2000 });
    assert.equal(result.success, true);
    assert.equal(result.location.accuracy, 25);
  }, { watch: [
    { latitude: 1, longitude: 1, accuracy: 2000, atMs: 10 },
    { latitude: 1, longitude: 1, accuracy: 900, atMs: 60 },
    { latitude: 2, longitude: 2, accuracy: 25, atMs: 300 },
  ] });
});

test("approximate location (~2 km) is reported with device-specific steps", async () => {
  const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 Version/18.1 Mobile/15E148 Safari/604.1";
  await withGeolocation([], async () => {
    const started = Date.now();
    const result = await getVoterLocation({ windowMs: 40, timeoutMs: 300 });
    assert.ok(Date.now() - started >= 290, "keeps waiting for a precise fix until the timeout");
    assert.match(result.error, /±2000 m/);
    assert.match(result.error, /Wi-Fi/);
    assert.equal(result.success, false);
    assert.equal(result.errorCode, "APPROXIMATE");
    assert.match(result.error, /Position exacte/);
  }, { userAgent: iphone, watch: [{ latitude: 1, longitude: 1, accuracy: 2000 }] });
});

test("blocked location on voter path does not fall back", async () => {
  await withGeolocation([], async (calls) => {
    const result = await getVoterLocation({ windowMs: 40 });
    assert.equal(result.errorCode, "PERMISSION_DENIED");
    assert.equal(calls.filter((c) => c.kind === "get").length, 0);
  }, { watch: [{ error: 1 }] });
});

test("no precise fix: falls back to a fresh normal location", async () => {
  await withGeolocation([{ latitude: 5, longitude: 5, accuracy: 50 }], async (calls) => {
    const result = await getVoterLocation({ windowMs: 40 });
    assert.equal(result.success, true);
    const fallback = calls.find((c) => c.kind === "get");
    assert.equal(fallback.enableHighAccuracy, false);
    assert.equal(fallback.maximumAge, 0);
  }, { watch: [{ error: 3 }] });
});

test("platform detection and messages", () => {
  assert.equal(detectPlatform("Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X)"), "ios");
  assert.equal(detectPlatform("Mozilla/5.0 (Linux; Android 14; Pixel 8)"), "android");
  assert.equal(detectPlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64)"), "windows");
  assert.match(locationMessage("PERMISSION_DENIED", "ios"), /Réglages → Confidentialité et sécurité → Service de localisation/);
  assert.match(locationMessage("PERMISSION_DENIED", "windows"), /Paramètres Windows/);
  assert.match(locationMessage("APPROXIMATE", "android"), /Utiliser la position exacte/);
  assert.doesNotMatch(locationMessage("PERMISSION_DENIED", "ios"), /icône/);
});
