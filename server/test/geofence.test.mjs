import assert from "node:assert/strict";
import { test } from "node:test";
import {
  evaluateLocation,
  haversineDistanceMeters,
  parseClientLocation,
  validateGeofenceUpdate,
} from "../src/geofence/geofence.mjs";
import { createRequireVenuePresence } from "../src/geofence/require-venue-presence.mjs";
import votingRouter from "../src/vote/voting.mjs";

const venue = {
  enabled: true,
  latitude: 36.8432,
  longitude: 10.1971,
  radiusMeters: 150,
  maxAccuracyMeters: 200,
};

// ~0.001 deg latitude is ~111 m.
const offsetNorth = (meters) => venue.latitude + meters / 111_195;

const createResponse = () => ({
  statusCode: 200,
  body: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  },
});

test("haversine distance is accurate for short distances", () => {
  const d = haversineDistanceMeters(
    { latitude: venue.latitude, longitude: venue.longitude },
    { latitude: offsetNorth(100), longitude: venue.longitude }
  );
  assert.ok(Math.abs(d - 100) < 1, `expected ~100 m, got ${d}`);
});

test("parseClientLocation rejects malformed payloads", () => {
  assert.equal(parseClientLocation(undefined), null);
  assert.equal(parseClientLocation("36,10"), null);
  assert.equal(parseClientLocation({ latitude: 91, longitude: 0, accuracy: 5 }), null);
  assert.equal(parseClientLocation({ latitude: 0, longitude: 181, accuracy: 5 }), null);
  assert.equal(parseClientLocation({ latitude: 0, longitude: 0, accuracy: -1 }), null);
  assert.equal(parseClientLocation({ latitude: "0", longitude: 0, accuracy: 5 }), null);
  assert.deepEqual(
    parseClientLocation({ latitude: 1, longitude: 2, accuracy: 3, ageMs: 1200, extra: true }),
    { latitude: 1, longitude: 2, accuracy: 3, ageMs: 1200 }
  );
  // Old clients that send no age are treated as too old.
  assert.equal(parseClientLocation({ latitude: 1, longitude: 2, accuracy: 3 }).ageMs, Infinity);
  assert.equal(parseClientLocation({ latitude: 1, longitude: 2, accuracy: 3, ageMs: "5" }).ageMs, Infinity);
});

test("disabled geofence allows any vote, even without location", () => {
  const result = evaluateLocation({ ...venue, enabled: false }, null);
  assert.equal(result.allowed, true);
});

test("enabled geofence without coordinates fails closed", () => {
  const result = evaluateLocation(
    { ...venue, latitude: null, longitude: null },
    { latitude: 0, longitude: 0, accuracy: 5, ageMs: 1000 }
  );
  assert.deepEqual(result, { allowed: false, reason: "GEOFENCE_NOT_CONFIGURED" });
});

test("missing location is rejected when geofence is enabled", () => {
  assert.equal(evaluateLocation(venue, null).reason, "LOCATION_REQUIRED");
});

test("imprecise fix is rejected", () => {
  const result = evaluateLocation(venue, {
    latitude: venue.latitude,
    longitude: venue.longitude,
    accuracy: 900,
    ageMs: 1000,
  });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, "LOCATION_INACCURATE");
  assert.equal(result.accuracyMeters, 900);
});

test("position inside radius is allowed", () => {
  const result = evaluateLocation(venue, {
    latitude: offsetNorth(120),
    longitude: venue.longitude,
    accuracy: 30,
    ageMs: 1000,
  });
  assert.equal(result.allowed, true);
  assert.equal(result.reason, "INSIDE_VENUE");
  assert.ok(Math.abs(result.distanceMeters - 120) <= 1);
});

test("position outside radius is rejected", () => {
  const result = evaluateLocation(venue, {
    latitude: offsetNorth(400),
    longitude: venue.longitude,
    accuracy: 20,
    ageMs: 1000,
  });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, "OUTSIDE_VENUE");
});

test("a cached (old) position is refused even when it is inside", () => {
  const inside = { latitude: venue.latitude, longitude: venue.longitude, accuracy: 15 };
  assert.equal(evaluateLocation(venue, { ...inside, ageMs: 29_000 }).allowed, true);
  assert.deepEqual(evaluateLocation(venue, { ...inside, ageMs: 55_000 }), { allowed: false, reason: "LOCATION_STALE" });
  assert.equal(evaluateLocation(venue, { ...inside, ageMs: Infinity }).reason, "LOCATION_STALE");
  assert.equal(evaluateLocation(venue, parseClientLocation(inside)).reason, "LOCATION_STALE");
});

test("validateGeofenceUpdate enforces types and ranges", () => {
  assert.ok(validateGeofenceUpdate({ enabled: "yes" }).error);
  assert.ok(validateGeofenceUpdate({ latitude: 100 }).error);
  assert.ok(validateGeofenceUpdate({ radiusMeters: 5 }).error);
  assert.ok(validateGeofenceUpdate({ maxAccuracyMeters: 99999 }).error);
  assert.deepEqual(
    validateGeofenceUpdate({ enabled: true, latitude: 1, longitude: 2, radiusMeters: 120.4 }),
    { value: { enabled: true, latitude: 1, longitude: 2, radiusMeters: 120 } }
  );
});

test("middleware returns 403 with a reason code when outside the venue", async () => {
  const middleware = createRequireVenuePresence({ loadSettings: async () => venue });
  const res = createResponse();
  let nextCalled = false;

  await middleware(
    {
      body: {
        vote: "yes",
        location: { latitude: offsetNorth(1000), longitude: venue.longitude, accuracy: 15, ageMs: 1000 },
      },
    },
    res,
    () => {
      nextCalled = true;
    }
  );

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, "OUTSIDE_VENUE");
  assert.equal(res.body.voted, false);
});

test("middleware attaches the check result and continues when inside", async () => {
  const middleware = createRequireVenuePresence({ loadSettings: async () => venue });
  const req = {
    body: {
      vote: "yes",
      location: { latitude: venue.latitude, longitude: venue.longitude, accuracy: 15, ageMs: 1000 },
    },
  };
  let nextCalled = false;

  await middleware(req, createResponse(), () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(req.venueCheck.reason, "INSIDE_VENUE");
  assert.equal(req.venueCheck.distanceMeters, 0);
});

test("middleware fails closed with 500 when settings cannot be loaded", async () => {
  const originalError = console.error;
  console.error = () => {};
  try {
    const middleware = createRequireVenuePresence({
      loadSettings: async () => {
        throw new Error("db down");
      },
    });
    const res = createResponse();
    let nextCalled = false;
    await middleware({ body: {} }, res, () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 500);
  } finally {
    console.error = originalError;
  }
});

test("vote route runs auth, then venue check, then the vote handler", () => {
  const layer = votingRouter.stack.find((entry) => entry.route?.path === "/api/vote/:id");
  const names = layer.route.stack.map((entry) => entry.handle.name);
  assert.equal(names.length, 3);
  assert.equal(names[0], "requireAuth");
});
