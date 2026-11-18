import { useEffect, useState } from "react";
import { Crosshair, MapPin } from "lucide-react";
import { Button } from "../ui/button";
import {
  getGeofenceSettings,
  updateGeofenceSettings,
} from "../../service/adminApi";
import { getCurrentLocation, parseCoordinatePair } from "../../service/geolocation";

const toInput = (value) => (value === null || value === undefined ? "" : String(value));
const toNumber = (value) => (value.trim() === "" ? undefined : Number(value));

const inputClass =
  "w-full rounded-md border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-slate-400 outline-none focus:border-white/50";

export const GeofencePanel = ({ onNotify }) => {
  const [loaded, setLoaded] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [form, setForm] = useState({
    latitude: "",
    longitude: "",
    radiusMeters: "150",
    maxAccuracyMeters: "200",
  });
  const [busy, setBusy] = useState(null); // null | 'locating' | 'saving'
  const [lastFixAccuracy, setLastFixAccuracy] = useState(null);
  const [locationError, setLocationError] = useState("");

  const applySettings = (settings) => {
    setEnabled(settings.enabled === true);
    setForm({
      latitude: toInput(settings.latitude),
      longitude: toInput(settings.longitude),
      radiusMeters: toInput(settings.radiusMeters),
      maxAccuracyMeters: toInput(settings.maxAccuracyMeters),
    });
  };

  useEffect(() => {
    getGeofenceSettings().then((result) => {
      if (result.success) {
        applySettings(result.data.settings);
      } else {
        onNotify?.("error", result.error);
      }
      setLoaded(true);
    });
  }, []);

  const updateField = (field) => (event) => {
    const value = event.target.value;
    // Pasting "lat, lng" from Google Maps into either field fills both.
    const pair = parseCoordinatePair(value);
    if ((field === "latitude" || field === "longitude") && pair) {
      setForm((current) => ({
        ...current,
        latitude: String(pair.latitude),
        longitude: String(pair.longitude),
      }));
      setLocationError("");
      return;
    }
    setForm((current) => ({ ...current, [field]: value }));
  };

  const useMyLocation = async () => {
    setBusy("locating");
    setLocationError("");
    const position = await getCurrentLocation({ timeoutMs: 15000 });
    setBusy(null);

    if (!position.success) {
      setLocationError(position.error);
      return;
    }

    const { latitude, longitude, accuracy } = position.location;
    setForm((current) => ({
      ...current,
      latitude: latitude.toFixed(6),
      longitude: longitude.toFixed(6),
    }));
    setLastFixAccuracy(Math.round(accuracy));
  };

  const save = async (nextEnabled) => {
    const payload = {
      enabled: nextEnabled,
      latitude: toNumber(form.latitude),
      longitude: toNumber(form.longitude),
      radiusMeters: toNumber(form.radiusMeters),
      maxAccuracyMeters: toNumber(form.maxAccuracyMeters),
    };

    for (const [key, value] of Object.entries(payload)) {
      if (Number.isNaN(value)) {
        onNotify?.("error", `${key} must be a number`);
        return;
      }
    }

    setBusy("saving");
    const result = await updateGeofenceSettings(payload);
    setBusy(null);

    if (!result.success) {
      onNotify?.("error", result.error);
      return;
    }

    applySettings(result.data.settings);
    onNotify?.("success", result.data.message);
  };

  if (!loaded) {
    return <p className="text-sm text-muted">Loading location settings...</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted">Status</span>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
            enabled ? "bg-green-500/20 text-green-300" : "bg-white/10 text-muted"
          }`}
        >
          {enabled ? "Enforced" : "Off"}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1 text-xs text-muted">
          Latitude
          <input
            className={inputClass}
            inputMode="decimal"
            value={form.latitude}
            onChange={updateField("latitude")}
            placeholder="36.843200 or paste lat, lng"
          />
        </label>
        <label className="space-y-1 text-xs text-muted">
          Longitude
          <input
            className={inputClass}
            inputMode="decimal"
            value={form.longitude}
            onChange={updateField("longitude")}
            placeholder="10.197100"
          />
        </label>
        <label className="space-y-1 text-xs text-muted">
          Radius (m)
          <input
            className={inputClass}
            inputMode="numeric"
            value={form.radiusMeters}
            onChange={updateField("radiusMeters")}
          />
        </label>
        <label className="space-y-1 text-xs text-muted">
          Max GPS error (m)
          <input
            className={inputClass}
            inputMode="numeric"
            value={form.maxAccuracyMeters}
            onChange={updateField("maxAccuracyMeters")}
          />
        </label>
      </div>

      <Button
        type="button"
        variant="outline"
        onClick={useMyLocation}
        disabled={Boolean(busy)}
        className="w-full border-white/20 text-white hover:bg-white/10"
      >
        <Crosshair className="mr-2 h-4 w-4" />
        {busy === "locating" ? "Locating..." : "Use my current location"}
      </Button>
      {locationError && (
        <div role="alert" className="rounded-md border border-red-400/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          <p>{locationError}</p>
          <p className="mt-1 text-red-100/80">
            Or open Google Maps, right-click the auditorium, click the coordinates to copy them,
            and paste them into Latitude.
          </p>
        </div>
      )}
      {lastFixAccuracy !== null && (
        <p className="text-xs text-faint">
          Fix accuracy: ±{lastFixAccuracy} m. Stand in the middle of the room for the best center.
        </p>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          onClick={() => save(enabled)}
          disabled={Boolean(busy)}
          variant="outline"
          className="border-white/20 text-white hover:bg-white/10"
        >
          Save
        </Button>
        <Button
          type="button"
          onClick={() => save(!enabled)}
          disabled={Boolean(busy)}
          className={
            enabled
              ? "bg-jobfair text-white hover:bg-jobfair-hover"
              : "bg-hackathon text-white hover:bg-hackathon-hover"
          }
        >
          <MapPin className="mr-2 h-4 w-4" />
          {enabled ? "Disable" : "Enable"}
        </Button>
      </div>
      <p className="text-xs text-faint">
        When enabled, every vote must come with a phone location inside the radius.
        Indoor GPS can be off by 20–100 m, so start with a generous radius.
      </p>
    </div>
  );
};
