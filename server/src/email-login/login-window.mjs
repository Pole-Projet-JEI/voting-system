import mongoose from "mongoose";

// Admin-controlled login window. Closed by default: nobody can request or use
// a login code until an admin opens it. Already logged-in voters keep their
// session.
const loginWindowSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: "login" },
    open: { type: Boolean, default: false },
    updatedBy: { type: String, default: null },
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

export const isLoginOpen = async ({ fresh = false } = {}) => {
  if (!fresh && cached !== null && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cached;
  }
  const doc = await LoginWindow.findOne({ key: "login" }).lean();
  cached = doc?.open === true;
  cachedAt = Date.now();
  return cached;
};

export const setLoginOpen = async (open, updatedBy = null) => {
  await LoginWindow.updateOne(
    { key: "login" },
    { $set: { open, updatedBy } },
    { upsert: true }
  );
  clearLoginWindowCache();
  return open;
};

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
