import crypto from "crypto";
import mongoose from "mongoose";

// Admin-controlled login window. Closed by default: nobody can join with the
// QR code until an admin opens it. Voters already joined keep their session
// when it closes.
const loginWindowSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: "login" },
    open: { type: Boolean, default: false },
    updatedBy: { type: String, default: null },
    // Secret part of the public projector link (/qr/<screenKey>), on the
    // "screen" document. Anyone with the link sees the rotating QR code.
    screenKey: { type: String, default: null },
  },
  { timestamps: true }
);

export const LoginWindow = mongoose.model("login_window", loginWindowSchema);

const CACHE_TTL_MS = 3_000;
let cached = null;
let cachedAt = 0;

export const clearLoginWindowCache = () => {
  cached = null;
  cachedAt = 0;
};

export const getLoginSettings = async ({ fresh = false } = {}) => {
  if (!fresh && cached && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cached;
  }
  const doc = await LoginWindow.findOne({ key: "login" }).lean();
  cached = { open: doc?.open === true };
  cachedAt = Date.now();
  return cached;
};

export const isLoginOpen = async (options) => (await getLoginSettings(options)).open;

export const updateLoginSettings = async (update, updatedBy = null) => {
  await LoginWindow.updateOne(
    { key: "login" },
    { $set: { ...update, updatedBy } },
    { upsert: true }
  );
  clearLoginWindowCache();
  return getLoginSettings({ fresh: true });
};

// ---- public projector screen key ----
const SCREEN_KEY_ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const SCREEN_KEY_PATTERN = /^[A-Za-z0-9]{10}$/;
let screenKeyCache = null;
let screenKeyCachedAt = 0;

export const newScreenKey = () =>
  Array.from(crypto.randomBytes(10), (b) => SCREEN_KEY_ALPHABET[b % SCREEN_KEY_ALPHABET.length]).join("");

export const getScreenKey = async ({ fresh = false } = {}) => {
  if (!fresh && screenKeyCache && Date.now() - screenKeyCachedAt < CACHE_TTL_MS) {
    return screenKeyCache;
  }
  // Created on first use; $setOnInsert keeps the existing key if two requests race.
  const doc = await LoginWindow.findOneAndUpdate(
    { key: "screen" },
    { $setOnInsert: { screenKey: newScreenKey() } },
    { upsert: true, new: true, lean: true }
  );
  screenKeyCache = doc.screenKey;
  screenKeyCachedAt = Date.now();
  return screenKeyCache;
};

export const rotateScreenKey = async (updatedBy = null) => {
  const screenKey = newScreenKey();
  await LoginWindow.updateOne({ key: "screen" }, { $set: { screenKey, updatedBy } }, { upsert: true });
  screenKeyCache = screenKey;
  screenKeyCachedAt = Date.now();
  return screenKey;
};

export const isScreenKey = async (given) => {
  if (typeof given !== "string" || !SCREEN_KEY_PATTERN.test(given)) return false;
  const expected = Buffer.from(await getScreenKey());
  const actual = Buffer.from(given);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
};

export const setLoginOpen = async (open, updatedBy = null) =>
  (await updateLoginSettings({ open }, updatedBy)).open;

export const requireLoginOpen =
  ({ checkOpen = isLoginOpen } = {}) =>
  async (req, res, next) => {
    try {
      if (!(await checkOpen())) {
        return res.status(403).json({
          status: "failed",
          code: "LOGIN_CLOSED",
          message: "La connexion est fermée. Attendez que les organisateurs l'ouvrent.",
        });
      }
      return next();
    } catch (error) {
      console.error("Login window check failed:", error.message);
      return res.status(500).json({ status: "failed", message: "Erreur du serveur" });
    }
  };
