import GeofenceSettings from "../mongodb/geofenceSchema.mjs";

const EARTH_RADIUS_METERS = 6_371_000;
const SETTINGS_CACHE_TTL_MS = 5_000;
const SETTINGS_KEY = "venue";

export const DEFAULT_GEOFENCE_SETTINGS = Object.freeze({
  enabled: false,
  latitude: null,
  longitude: null,
  radiusMeters: 150,
  maxAccuracyMeters: 200,
});

export const GEOFENCE_LIMITS = Object.freeze({
  minRadiusMeters: 10,
  maxRadiusMeters: 5000,
  minAccuracyMeters: 10,
  maxAccuracyMeters: 5000,
});

const toRadians = (degrees) => (degrees * Math.PI) / 180;

// Great-circle distance between two WGS84 points, in meters.
export const haversineDistanceMeters = (from, to) => {
  const dLat = toRadians(to.latitude - from.latitude);
  const dLon = toRadians(to.longitude - from.longitude);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(from.latitude)) *
      Math.cos(toRadians(to.latitude)) *
      Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(a)));
};

const isFiniteNumber = (value) =>
  typeof value === "number" && Number.isFinite(value);

export const isValidLatitude = (value) =>
  isFiniteNumber(value) && value >= -90 && value <= 90;

export const isValidLongitude = (value) =>
  isFiniteNumber(value) && value >= -180 && value <= 180;

// Parses the location a client sends with its vote. Returns null when the
// payload is missing or malformed.
export const parseClientLocation = (raw) => {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const { latitude, longitude, accuracy } = raw;
  if (
    !isValidLatitude(latitude) ||
    !isValidLongitude(longitude) ||
    !isFiniteNumber(accuracy) ||
    accuracy < 0
  ) {
    return null;
  }

  return { latitude, longitude, accuracy };
};

// Decides whether a reported position is inside the venue.
// The phone's reported accuracy is a radius of uncertainty: we reject fixes
// that are too vague, and otherwise allow the point if it is within
// `radiusMeters` of the venue center.
export const evaluateLocation = (settings, location) => {
  if (!settings?.enabled) {
    return { allowed: true, reason: "GEOFENCE_DISABLED" };
  }

  if (!isValidLatitude(settings.latitude) || !isValidLongitude(settings.longitude)) {
    return { allowed: false, reason: "GEOFENCE_NOT_CONFIGURED" };
  }

  if (!location) {
    return { allowed: false, reason: "LOCATION_REQUIRED" };
  }

  const accuracyMeters = Math.round(location.accuracy);
  if (location.accuracy > settings.maxAccuracyMeters) {
    return { allowed: false, reason: "LOCATION_INACCURATE", accuracyMeters };
  }

  const distanceMeters = Math.round(
    haversineDistanceMeters(
      { latitude: settings.latitude, longitude: settings.longitude },
      location
    )
  );

  if (distanceMeters > settings.radiusMeters) {
    return {
      allowed: false,
      reason: "OUTSIDE_VENUE",
      distanceMeters,
      accuracyMeters,
    };
  }

  return { allowed: true, reason: "INSIDE_VENUE", distanceMeters, accuracyMeters };
};

// Validates an admin update. Returns { value } or { error }.
export const validateGeofenceUpdate = (body = {}) => {
  const value = {};

  if (body.enabled !== undefined) {
    if (typeof body.enabled !== "boolean") {
      return { error: "enabled must be a boolean" };
    }
    value.enabled = body.enabled;
  }

  for (const [field, validator, label] of [
    ["latitude", isValidLatitude, "latitude must be between -90 and 90"],
    ["longitude", isValidLongitude, "longitude must be between -180 and 180"],
  ]) {
    if (body[field] !== undefined) {
      if (!validator(body[field])) {
        return { error: label };
      }
      value[field] = body[field];
    }
  }

  const ranges = [
    ["radiusMeters", GEOFENCE_LIMITS.minRadiusMeters, GEOFENCE_LIMITS.maxRadiusMeters],
    ["maxAccuracyMeters", GEOFENCE_LIMITS.minAccuracyMeters, GEOFENCE_LIMITS.maxAccuracyMeters],
  ];
  for (const [field, min, max] of ranges) {
    if (body[field] !== undefined) {
      if (!isFiniteNumber(body[field]) || body[field] < min || body[field] > max) {
        return { error: `${field} must be between ${min} and ${max}` };
      }
      value[field] = Math.round(body[field]);
    }
  }

  return { value };
};

let cachedSettings = null;
let cachedAt = 0;

export const clearGeofenceCache = () => {
  cachedSettings = null;
  cachedAt = 0;
};

const toPlainSettings = (doc) => ({
  ...DEFAULT_GEOFENCE_SETTINGS,
  ...(doc
    ? {
        enabled: doc.enabled === true,
        latitude: doc.latitude ?? null,
        longitude: doc.longitude ?? null,
        radiusMeters: doc.radiusMeters ?? DEFAULT_GEOFENCE_SETTINGS.radiusMeters,
        maxAccuracyMeters:
          doc.maxAccuracyMeters ?? DEFAULT_GEOFENCE_SETTINGS.maxAccuracyMeters,
        updatedAt: doc.updatedAt ?? null,
        updatedBy: doc.updatedBy ?? null,
      }
    : {}),
});

// Settings are read on every vote; a short cache keeps ~600 simultaneous
// votes from each hitting the settings collection.
export const getGeofenceSettings = async ({ fresh = false } = {}) => {
  if (!fresh && cachedSettings && Date.now() - cachedAt < SETTINGS_CACHE_TTL_MS) {
    return cachedSettings;
  }

  const doc = await GeofenceSettings.findOne({ key: SETTINGS_KEY }).lean();
  cachedSettings = toPlainSettings(doc);
  cachedAt = Date.now();
  return cachedSettings;
};

export const updateGeofenceSettings = async (update, updatedBy = null) => {
  const current = await getGeofenceSettings({ fresh: true });
  const next = { ...current, ...update };

  if (
    next.enabled &&
    (!isValidLatitude(next.latitude) || !isValidLongitude(next.longitude))
  ) {
    return { error: "Set the venue latitude and longitude before enabling" };
  }

  const doc = await GeofenceSettings.findOneAndUpdate(
    { key: SETTINGS_KEY },
    { $set: { ...update, updatedBy } },
    { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true }
  ).lean();

  clearGeofenceCache();
  return { settings: toPlainSettings(doc) };
};
