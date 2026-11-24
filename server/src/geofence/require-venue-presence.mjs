import {
  evaluateLocation,
  getGeofenceSettings,
  parseClientLocation,
} from "./geofence.mjs";

const MESSAGES = {
  GEOFENCE_NOT_CONFIGURED:
    "La vérification de la position est activée mais le lieu n'est pas configuré. Contactez les organisateurs.",
  LOCATION_REQUIRED:
    "Votre position est nécessaire pour voter. Autorisez l'accès à la position et réessayez.",
  LOCATION_INACCURATE:
    "Votre position n'est pas assez précise. Activez la position précise / le GPS et réessayez.",
  OUTSIDE_VENUE: "You must be inside the venue to vote.",
  LOCATION_STALE: "Your phone sent an old position. Please try again.",
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
        // Distance/accuracy only (no coordinates) so admins can tune the
        // radius and max GPS error from real rejections.
        console.info(
          JSON.stringify({
            event: "geofence_rejected",
            requestId: req.requestId,
            reason: result.reason,
            distanceMeters: result.distanceMeters ?? null,
            accuracyMeters: result.accuracyMeters ?? null,
            radiusMeters: settings?.radiusMeters ?? null,
            maxAccuracyMeters: settings?.maxAccuracyMeters ?? null,
          })
        );
        return res.status(403).json({
          voted: false,
          code: result.reason,
          message: MESSAGES[result.reason] || "La vérification de la position a échoué",
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
      return res.status(500).json({ voted: false, message: "Erreur du serveur" });
    }
  };

export const requireVenuePresence = createRequireVenuePresence();
