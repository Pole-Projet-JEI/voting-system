// Thin wrapper around the browser Geolocation API.
// Resolves to { success, location?, errorCode?, error? }.
//
// Strategy: ask for a precise (GPS) fix first. Laptops and desktops have no
// GPS and often time out or report "position unavailable" in that mode, so on
// those errors retry once with the normal (Wi-Fi based) location.

const ERROR_MESSAGES = {
  UNSUPPORTED: "Your browser does not support location. Try another browser.",
  INSECURE: "Location only works over HTTPS. Please use the secure voting link.",
  PERMISSION_DENIED:
    "Location access is blocked for this site. Click the lock icon next to the address bar (or open the browser's site settings), set Location to Allow, then reload the page.",
  POSITION_UNAVAILABLE:
    "Your device could not determine its location. Turn on location services (and Wi-Fi on a laptop), then try again.",
  TIMEOUT: "Getting your location took too long. Please try again.",
};

const CODE_BY_ERROR = {
  1: "PERMISSION_DENIED",
  2: "POSITION_UNAVAILABLE",
  3: "TIMEOUT",
};

const requestPosition = (options) =>
  new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          success: true,
          location: {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
          },
        }),
      (error) => {
        const errorCode = CODE_BY_ERROR[error.code] || "POSITION_UNAVAILABLE";
        resolve({ success: false, errorCode, error: ERROR_MESSAGES[errorCode] });
      },
      options
    );
  });

export const getCurrentLocation = async ({ timeoutMs = 15000 } = {}) => {
  if (typeof window !== "undefined" && window.isSecureContext === false) {
    return { success: false, errorCode: "INSECURE", error: ERROR_MESSAGES.INSECURE };
  }

  if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
    return { success: false, errorCode: "UNSUPPORTED", error: ERROR_MESSAGES.UNSUPPORTED };
  }

  const precise = await requestPosition({
    enableHighAccuracy: true,
    timeout: timeoutMs,
    maximumAge: 0,
  });

  if (precise.success || precise.errorCode === "PERMISSION_DENIED") {
    return precise;
  }

  // Fallback for devices without GPS (or a slow GPS fix indoors).
  return requestPosition({
    enableHighAccuracy: false,
    timeout: timeoutMs,
    maximumAge: 60_000,
  });
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
