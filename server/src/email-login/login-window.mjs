import mongoose from "mongoose";

// Admin-controlled login settings:
//   open      - login window. Closed by default: nobody can request or use a
//               login code until an admin opens it. Logged-in voters keep
//               their session when it closes.
//   anyEmail  - true: anyone can log in with any (non-disposable) email.
//               false: only emails on the imported list (or allowed domains).
const loginWindowSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: "login" },
    open: { type: Boolean, default: false },
    anyEmail: { type: Boolean, default: true },
    updatedBy: { type: String, default: null },
  },
  { timestamps: true }
);

export const LoginWindow = mongoose.model("login_window", loginWindowSchema);

const DEFAULTS = Object.freeze({ open: false, anyEmail: true });
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
  cached = {
    open: doc?.open === true,
    anyEmail: doc?.anyEmail === undefined ? DEFAULTS.anyEmail : doc.anyEmail === true,
  };
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
          message: "Login is closed. Wait for the organizers to open it.",
        });
      }
      return next();
    } catch (error) {
      console.error("Login window check failed:", error.message);
      return res.status(500).json({ status: "failed", message: "Server error" });
    }
  };
