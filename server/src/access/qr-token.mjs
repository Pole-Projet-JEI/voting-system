import crypto from "crypto";

// Rotating join link shown as a QR code on the venue screen.
//
// Time is cut into windows of QR_ROTATE_SECONDS (default 20 s). Each window
// has its own token "<window>-<mac>", where mac = HMAC(secret, window). The
// server keeps no state: any instance can check a token with the secret.
//
// A token is accepted during its own window, plus a short grace period after
// it rotates (QR_GRACE_SECONDS, default 10 s) so someone who scanned at the
// last second still gets in while the page loads. After that it is refused,
// so a photo of the QR code sent outside stops working within ~30 s.

const DEFAULT_PERIOD_SECONDS = 20;
const DEFAULT_GRACE_SECONDS = 10;
const MAC_LENGTH = 22; // base64url chars, ~132 bits
const TOKEN_PATTERN = /^(\d{1,12})-([A-Za-z0-9_-]{22})$/;

const readSeconds = (name, fallback, min, max) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= min && value <= max ? value : fallback;
};

export const getQrPeriodSeconds = () =>
  readSeconds("QR_ROTATE_SECONDS", DEFAULT_PERIOD_SECONDS, 5, 600);

export const getQrGraceSeconds = () =>
  readSeconds("QR_GRACE_SECONDS", DEFAULT_GRACE_SECONDS, 0, 120);

const getSecret = () => {
  const base = process.env.QR_SECRET || process.env.SESSION_SECRET;
  if (!base) {
    throw new Error("QR_SECRET or SESSION_SECRET must be configured");
  }
  // Derived key: a QR token never reveals or doubles as the cookie secret.
  return crypto.createHmac("sha256", base).update("qr-join-v1").digest();
};

const macFor = (window) =>
  crypto
    .createHmac("sha256", getSecret())
    .update(`join:${window}`)
    .digest("base64url")
    .slice(0, MAC_LENGTH);

export const currentQrWindow = (now = Date.now()) =>
  Math.floor(now / (getQrPeriodSeconds() * 1000));

export const createQrToken = (now = Date.now()) => {
  const periodMs = getQrPeriodSeconds() * 1000;
  const window = currentQrWindow(now);
  return {
    token: `${window}-${macFor(window)}`,
    expiresAt: (window + 1) * periodMs,
    periodSeconds: periodMs / 1000,
  };
};

// Returns { ok: true } or { ok: false, error: "QR_INVALID" | "QR_EXPIRED" }.
export const verifyQrToken = (token, now = Date.now()) => {
  const match = typeof token === "string" ? TOKEN_PATTERN.exec(token) : null;
  if (!match) {
    return { ok: false, error: "QR_INVALID" };
  }
  const window = Number(match[1]);
  const expected = Buffer.from(macFor(window));
  const given = Buffer.from(match[2]);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) {
    return { ok: false, error: "QR_INVALID" };
  }

  const periodMs = getQrPeriodSeconds() * 1000;
  const startsAt = window * periodMs;
  const acceptedUntil = startsAt + periodMs + getQrGraceSeconds() * 1000;
  // Small allowance for clock skew; tokens from the future are never issued.
  if (now < startsAt - 2000 || now >= acceptedUntil) {
    return { ok: false, error: "QR_EXPIRED" };
  }
  return { ok: true };
};
