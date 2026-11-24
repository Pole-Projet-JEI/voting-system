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
    ios: "La position est bloquée sur cet iPhone. Ouvrez Réglages → Confidentialité et sécurité → Service de localisation : activez-le, puis touchez Sites web Safari (ou votre navigateur) → « Lorsque l'app est active » et activez Position exacte. Revenez ici et touchez Réessayer.",
    android: "La position est bloquée. Touchez l'icône à gauche de l'adresse du site → Autorisations → Position → Autoriser. Vérifiez aussi que la Position est activée dans les réglages rapides du téléphone. Puis touchez Réessayer.",
    windows: "La position est bloquée. Ouvrez Paramètres Windows → Confidentialité et sécurité → Localisation : activez les services de localisation et « Autoriser les applications de bureau à accéder à votre position ». Dans le navigateur, cliquez sur l'icône à gauche de l'adresse → Position → Autoriser. Puis réessayez — ou votez simplement depuis votre téléphone.",
    mac: "La position est bloquée. Ouvrez Réglages Système → Confidentialité et sécurité → Service de localisation et autorisez votre navigateur. Dans le navigateur, autorisez la Position pour ce site. Puis réessayez — ou votez depuis votre téléphone.",
    other: "La position est bloquée pour ce site. Autorisez la Position dans les réglages du site de votre navigateur, puis réessayez.",
  },
  APPROXIMATE: {
    ios: "Votre iPhone ne donne qu'une position approximative{acc}. Activez le Wi-Fi (inutile de vous connecter) : à l'intérieur, il rend la position précise. Vérifiez aussi Réglages → Confidentialité et sécurité → Service de localisation → Sites web Safari (ou votre navigateur) → Position exacte activée. Puis touchez Réessayer.",
    android: "Votre téléphone ne donne qu'une position approximative{acc}. Activez le Wi-Fi (inutile de vous connecter) : à l'intérieur, il rend la position précise. Vérifiez aussi Paramètres → Position → Précision de la localisation Google activée, et Paramètres → Applications → Chrome → Autorisations → Position → « Utiliser la position exacte ». Puis touchez Réessayer.",
    windows: "Cet ordinateur ne trouve qu'une position approximative{acc}. Activez Paramètres Windows → Confidentialité et sécurité → Services de localisation, et activez le Wi-Fi. Pour un vote fiable, utilisez votre téléphone.",
    mac: "Cet ordinateur ne trouve qu'une position approximative{acc}. Activez le Wi-Fi et autorisez le Service de localisation pour votre navigateur. Pour un vote fiable, utilisez votre téléphone.",
    other: "Votre appareil ne donne qu'une position approximative{acc}. Activez le Wi-Fi et la position exacte, puis réessayez — ou votez depuis votre téléphone.",
  },
  POSITION_UNAVAILABLE: {
    ios: "Votre iPhone n'a pas trouvé sa position. Vérifiez que Réglages → Confidentialité et sécurité → Service de localisation est activé, approchez-vous d'une fenêtre si possible, puis touchez Réessayer.",
    android: "Votre téléphone n'a pas trouvé sa position. Activez la Position dans les réglages rapides, puis touchez Réessayer.",
    windows: "Cet ordinateur n'a pas trouvé sa position. Activez les services de localisation dans les Paramètres Windows et le Wi-Fi — ou votez depuis votre téléphone.",
    mac: "Cet ordinateur n'a pas trouvé sa position. Activez le Wi-Fi et le Service de localisation — ou votez depuis votre téléphone.",
    other: "Votre appareil n'a pas pu déterminer sa position. Activez la localisation, puis réessayez.",
  },
};

const plain = {
  UNSUPPORTED: "Votre navigateur ne gère pas la position. Essayez un autre navigateur.",
  INSECURE: "La position ne fonctionne qu'en HTTPS. Utilisez le lien de vote sécurisé.",
  TIMEOUT: "La recherche de votre position a pris trop de temps. Réessayez.",
};

export const locationMessage = (errorCode, platform = detectPlatform(), { accuracy } = {}) =>
  (STEPS[errorCode]?.[platform] || STEPS[errorCode]?.other || plain[errorCode] || plain.TIMEOUT).replace(
    "{acc}",
    Number.isFinite(accuracy) ? ` (±${Math.round(accuracy)} m)` : ""
  );

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

// Voter reading: watch the position and keep the most accurate fresh fix.
//   - stop at once when a fix is within goodEnoughMeters;
//   - after windowMs, stop as soon as the best fix is within targetMeters
//     (the venue's max GPS error);
//   - otherwise keep waiting up to timeoutMs: indoors, phones first answer
//     with a rough cell-tower position (1-3 km) and need several seconds for
//     a GPS / Wi-Fi fix. Only then is the position called approximate.
// Falls back to the normal location if the precise one never arrives.
export const getVoterLocation = async ({
  windowMs = 4000,
  goodEnoughMeters = 20,
  targetMeters = 100,
  timeoutMs = 20000,
} = {}) => {
  const blocked = preflight();
  if (blocked) return blocked;

  const watched = await new Promise((resolve) => {
    let best = null;
    let done = false;
    let windowPassed = false;
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
        if (best.accuracy <= goodEnoughMeters || (windowPassed && best.accuracy <= targetMeters)) {
          finishWithBest();
        }
      },
      (error) => {
        const errorCode = CODE_BY_ERROR[error.code] || "POSITION_UNAVAILABLE";
        if (errorCode === "PERMISSION_DENIED" || !best) finish(fail(errorCode));
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 }
    );
    // After the window, stop if the best fix is precise enough; else keep going.
    timers.push(
      setTimeout(() => {
        windowPassed = true;
        if (best && best.accuracy <= targetMeters) finishWithBest();
      }, windowMs)
    );
    timers.push(setTimeout(finishWithBest, timeoutMs));
  });

  let result = watched;
  if (!watched.success && watched.errorCode !== "PERMISSION_DENIED") {
    result = await requestPosition({ enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 0 });
  }
  if (result.success && result.location.accuracy > APPROXIMATE_METERS) {
    return {
      success: false,
      errorCode: "APPROXIMATE",
      error: locationMessage("APPROXIMATE", detectPlatform(), { accuracy: result.location.accuracy }),
      location: result.location,
    };
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
