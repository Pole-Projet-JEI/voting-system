import "dotenv/config";
import crypto from "crypto";

// Get admin keys from env (supports multiple keys for rotation)
export const ADMIN_KEYS = process.env.ADMIN_KEYS
  ? process.env.ADMIN_KEYS.split(",").map((k) => k.trim())
  : [process.env.ADMIN_SECRET_KEY];

export const JWT_SECRET =
  process.env.JWT_SECRET || crypto.randomBytes(32).toString("hex");
export const JWT_EXPIRY = process.env.JWT_EXPIRY || "24h";

const hasAdminCredentials =
  Boolean(process.env.ADMIN_USERNAME) && Boolean(process.env.ADMIN_PASSWORD);

if (!ADMIN_KEYS[0] && !hasAdminCredentials) {
  console.warn(
    "⚠️ No admin bootstrap credentials configured; existing database accounts will be used"
  );
}

console.log(
  `✅ Admin auth configured with ${
    ADMIN_KEYS[0] ? `${ADMIN_KEYS.length} key(s)` : "individual credentials"
  }`
);
