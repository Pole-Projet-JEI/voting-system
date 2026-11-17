import mongoose from "mongoose";

// Single settings document (key: "venue") describing the circle voters must be
// inside to cast a vote. Disabled by default so existing deployments keep
// working until an admin configures the venue.
const geofenceSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      default: "venue",
    },
    enabled: {
      type: Boolean,
      default: false,
    },
    latitude: {
      type: Number,
      min: -90,
      max: 90,
      default: null,
    },
    longitude: {
      type: Number,
      min: -180,
      max: 180,
      default: null,
    },
    radiusMeters: {
      type: Number,
      min: 10,
      max: 5000,
      default: 150,
    },
    maxAccuracyMeters: {
      type: Number,
      min: 10,
      max: 5000,
      default: 200,
    },
    updatedBy: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

const GeofenceSettings = mongoose.model("geofence_settings", geofenceSchema);
export default GeofenceSettings;
