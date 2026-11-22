// Wrapper around the browser Geolocation API.
// Every function resolves to { success, location?, errorCode?, error? } where
// location = { latitude, longitude, accuracy, ageMs }.
//
// Rules learned from testing on phones and laptops:
//   - never accept a cached position (maximumAge: 0): a cache filled while
//     the person was inside would let them vote from outside;
//   - a single GPS reading jumps by tens of metres indoors, so voters take the
//     best reading over a few seconds;
//   - "approximate location" (Android/iPhone setting, or a PC without a
//     location service) reports ~1-3 km and can never pass: say exactly
//     which setting to change, per device.

export const APPROXIMATE_METERS = 1000;

export const detectPlatform = (ua = typeof navigator !== "undefined" ? navigator.userAgent || "" : "") => {
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && typeof navigator !== "undefined" && navigator.maxTouchPoints > 1)) {
    return "ios";
  }
  if (/Android/i.test(ua)) return "android";
  if (/Windows/i.test(ua)) return "windows";
  if (/Macintosh|Mac OS X/i.test(ua)) return "mac";
  return "other";
};

const STEPS = {
  PERMISSION_DENIED: {
    ios: "Location is blocked on this iPhone. Open Settings → Privacy & Security → Location Services: turn it On, then tap Safari Websites (or your browser) → \"While Using the App\" and turn on Precise Location. Come back here and tap Try again.",
    android: "Location is blocked. Tap the icon left of the web address → Permissions → Location → Allow. Also check that Location is On in the phone's quick settings. Then tap Try again.",
    windows: "Location is blocked. Open Windows Settings → Privacy & security → Location: turn on Location services and \"Let desktop apps access your location\". In the browser, click the icon left of the web address → Location → Allow. Then try again — or simply vote from your phone.",
    mac: "Location is blocked. Open System Settings → Privacy & Security → Location Services and allow your browser. In the browser, allow Location for this site. Then try again — or vote from your phone.",
    other: "Location is blocked for this site. Allow Location in your browser's site settings, then try again.",
  },
  APPROXIMATE: {
    ios: "Your iPhone only shares an approximate location. Open Settings → Privacy & Security → Location Services → Safari Websites (or your browser) and turn on Precise Location. Then tap Try again.",
    android: "Your phone only shares an approximate location. Open Settings → Apps → Chrome (or your browser) → Permissions → Location and turn on \"Use precise location\". Then tap Try again.",
    windows: "This computer can only find an approximate location. Turn on Windows Settings → Privacy & security → Location services, and turn on Wi-Fi. For a reliable vote, use your phone.",
    mac: "This computer can only find an approximate location. Turn on Wi-Fi and allow Location Services for your browser. For a reliable vote, use your phone.",
    other: "Your device only shares an approximate location. Turn on precise location, then try again — or vote from your phone.",
  },
  POSITION_UNAVAILABLE: {
    ios: "Your iPhone could not find its location. Check Settings → Privacy & Security → Location Services is On, move near a window if you can, then tap Try again.",
    android: "Your phone could not find its location. Turn on Location in the quick settings, then tap Try again.",
    windows: "This computer could not find its location. Turn on Location services in Windows Settings and Wi-Fi — or vote from your phone.",
    mac: "This computer could not find its location. Turn on Wi-Fi and Location Services — or vote from your phone.",
    other: "Your device could not determine its location. Turn on location services, then try again.",
  },
};

const plain = {
  UNSUPPORTED: "Your browser does not support location. Try another browser.",
  INSECURE: "Location only works over HTTPS. Please use the secure voting link.",
  TIMEOUT: "Getting your location took too long. Please try again.",
};

export const locationMessage = (errorCode, platform = detectPlatform()) =>
  STEPS[errorCode]?.[platform] || STEPS[errorCode]?.other || plain[errorCode] || plain.TIMEOUT;

const CODE_BY_ERROR = { 1: "PERMISSION_DENIED", 2: "POSITION_UNAVAILABLE", 3: "TIMEOUT" };

const fail = (errorCode) => ({ success: false, errorCode, error: locationMessage(errorCode) });

const toLocation = (position) => ({
  latitude: position.coords.latitude,
  longitude: position.coords.longitude,
  accuracy: position.coords.accuracy,
  ageMs: Number.isFinite(position.timestamp) ? Math.max(0, Date.now() - position.timestamp) : 0,
});

const preflight = () => {
  if (typeof window !== "undefined" && window.isSecureContext === false) return fail("INSECURE");
  if (typeof navigator === "undefined" || !("geolocation" in navigator)) return fail("UNSUPPORTED");
  return null;
};

const requestPosition = (options) =>
  new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ success: true, location: toLocation(position) }),
      (error) => resolve(fail(CODE_BY_ERROR[error.code] || "POSITION_UNAVAILABLE")),
      options
    );
  });

// One reading: precise first, then the normal (Wi-Fi) location for devices
// without GPS. Never cached. Used by the admin "use my location" button.
export const getCurrentLocation = async ({ timeoutMs = 15000 } = {}) => {
  const blocked = preflight();
  if (blocked) return blocked;

  const precise = await requestPosition({ enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 });
  if (precise.success || precise.errorCode === "PERMISSION_DENIED") return precise;
  return requestPosition({ enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 0 });
};

// Voter reading: watch the position for up to `windowMs` and keep the most
// accurate fresh fix; stop early once it is good enough. Falls back to the
// normal location if the precise one never arrives.
export const getVoterLocation = async ({ windowMs = 6000, goodEnoughMeters = 20, timeoutMs = 15000 } = {}) => {
  const blocked = preflight();
  if (blocked) return blocked;

  const watched = await new Promise((resolve) => {
    let best = null;
    let done = false;
    let watchId = null;
    const timers = [];
    const finish = (result) => {
      if (done) return;
      done = true;
      timers.forEach(clearTimeout);
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      resolve(result);
    };
    const finishWithBest = () => finish(best ? { success: true, location: best } : fail("TIMEOUT"));

    watchId = navigator.geolocation.watchPosition(
      (position) => {
        const location = toLocation(position);
        if (!best || location.accuracy < best.accuracy) best = location;
        if (best.accuracy <= goodEnoughMeters) finishWithBest();
      },
      (error) => {
        const errorCode = CODE_BY_ERROR[error.code] || "POSITION_UNAVAILABLE";
        if (errorCode === "PERMISSION_DENIED" || !best) finish(fail(errorCode));
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 }
    );
    // After the window, use the best fix so far; with none, wait up to timeoutMs.
    timers.push(setTimeout(() => best && finishWithBest(), windowMs));
    timers.push(setTimeout(finishWithBest, timeoutMs));
  });

  let result = watched;
  if (!watched.success && watched.errorCode !== "PERMISSION_DENIED") {
    result = await requestPosition({ enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 0 });
  }
  if (result.success && result.location.accuracy > APPROXIMATE_METERS) {
    return { ...fail("APPROXIMATE"), location: result.location };
  }
  return result;
};

// "granted" | "denied" | "prompt" | "unknown" (Permissions API missing).
export const getLocationPermission = async () => {
  try {
    const status = await navigator.permissions.query({ name: "geolocation" });
    return status.state;
  } catch {
    return "unknown";
  }
};

// Parses "36.842563, 10.197510" (as copied from Google Maps) into numbers.
export const parseCoordinatePair = (text) => {
  const match = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/.exec(text || "");
  if (!match) {
    return null;
  }
  const latitude = Number(match[1]);
  const longitude = Number(match[2]);
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    return null;
  }
  return { latitude, longitude };
};
