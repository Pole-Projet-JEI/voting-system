// Thin wrapper around the browser Geolocation API.
// Resolves to { success, location? , errorCode?, error? }.

const ERROR_MESSAGES = {
  UNSUPPORTED: "Your browser does not support location. Try another browser.",
  INSECURE: "Location only works over HTTPS. Please use the secure voting link.",
  PERMISSION_DENIED:
    "Location access was denied. Allow location for this site in your browser settings, then try again.",
  POSITION_UNAVAILABLE:
    "Your location could not be determined. Turn on location / GPS and try again.",
  TIMEOUT: "Getting your location took too long. Please try again.",
};

const CODE_BY_ERROR = {
  1: "PERMISSION_DENIED",
  2: "POSITION_UNAVAILABLE",
  3: "TIMEOUT",
};

export const getCurrentLocation = ({ timeoutMs = 15000 } = {}) =>
  new Promise((resolve) => {
    if (typeof window !== "undefined" && window.isSecureContext === false) {
      resolve({ success: false, errorCode: "INSECURE", error: ERROR_MESSAGES.INSECURE });
      return;
    }

    if (!("geolocation" in navigator)) {
      resolve({
        success: false,
        errorCode: "UNSUPPORTED",
        error: ERROR_MESSAGES.UNSUPPORTED,
      });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          success: true,
          location: {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
          },
        });
      },
      (error) => {
        const errorCode = CODE_BY_ERROR[error.code] || "POSITION_UNAVAILABLE";
        resolve({ success: false, errorCode, error: ERROR_MESSAGES[errorCode] });
      },
      {
        enableHighAccuracy: true,
        timeout: timeoutMs,
        maximumAge: 0,
      }
    );
  });
