import {
  evaluateLocation,
  getGeofenceSettings,
  parseClientLocation,
} from "./geofence.mjs";

const MESSAGES = {
  GEOFENCE_NOT_CONFIGURED:
    "Location check is enabled but the venue is not configured. Please contact the organizers.",
  LOCATION_REQUIRED:
    "Your location is required to vote. Please allow location access and try again.",
  LOCATION_INACCURATE:
    "Your location is not precise enough. Enable precise location / GPS and try again.",
  OUTSIDE_VENUE: "You must be inside the venue to vote.",
};

// Express middleware: rejects votes whose reported position is outside the
// configured venue. Attaches the evaluation to req.venueCheck on success.
export const createRequireVenuePresence =
  ({ loadSettings = getGeofenceSettings } = {}) =>
  async (req, res, next) => {
    try {
      const settings = await loadSettings();
      const location = parseClientLocation(req.body?.location);
      const result = evaluateLocation(settings, location);

      if (!result.allowed) {
        return res.status(403).json({
          voted: false,
          code: result.reason,
          message: MESSAGES[result.reason] || "Location check failed",
          ...(result.distanceMeters !== undefined && {
            distanceMeters: result.distanceMeters,
          }),
          ...(result.accuracyMeters !== undefined && {
            accuracyMeters: result.accuracyMeters,
          }),
        });
      }

      req.venueCheck = result;
      return next();
    } catch (error) {
      console.error("Geofence check failed:", error);
      return res.status(500).json({ voted: false, message: "Server error" });
    }
  };

export const requireVenuePresence = createRequireVenuePresence();
