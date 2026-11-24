import { Router } from "express";
import { requireAdmin } from "../admin/middleware/requireAdmin.mjs";
import {
  getGeofenceSettings,
  GEOFENCE_LIMITS,
  updateGeofenceSettings,
  validateGeofenceUpdate,
} from "./geofence.mjs";

const route = Router();

// Public: lets the voter page know whether it must ask for location.
// The venue coordinates are intentionally not exposed here.
route.get("/api/geofence", async (req, res) => {
  try {
    const settings = await getGeofenceSettings();
    return res.json({
      enabled: settings.enabled,
      maxAccuracyMeters: settings.maxAccuracyMeters,
    });
  } catch (error) {
    console.error("Error reading geofence settings:", error);
    return res.status(500).json({ message: "Erreur interne du serveur" });
  }
});

route.get("/api/admin/geofence", requireAdmin, async (req, res) => {
  try {
    const settings = await getGeofenceSettings({ fresh: true });
    return res.json({ settings, limits: GEOFENCE_LIMITS });
  } catch (error) {
    console.error("Error reading geofence settings:", error);
    return res.status(500).json({ message: "Erreur interne du serveur" });
  }
});

route.put("/api/admin/geofence", requireAdmin, async (req, res) => {
  try {
    const { value, error } = validateGeofenceUpdate(req.body);
    if (error) {
      return res.status(400).json({ message: error });
    }

    const result = await updateGeofenceSettings(value, req.admin?.username || null);
    if (result.error) {
      return res.status(400).json({ message: result.error });
    }

    return res.json({
      success: true,
      message: result.settings.enabled
        ? "Vérification de la position activée"
        : "Réglages de position enregistrés (vérification désactivée)",
      settings: result.settings,
    });
  } catch (error) {
    console.error("Error updating geofence settings:", error);
    return res.status(500).json({ message: "Erreur interne du serveur" });
  }
});

export default route;
