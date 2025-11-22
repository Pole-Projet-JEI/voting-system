import crypto from "crypto";

// Get admin keys from env (supports multiple keys for rotation)
export const ADMIN_KEYS = process.env.ADMIN_KEYS
  ? process.env.ADMIN_KEYS.split(",").map((k) => k.trim())
  : [process.env.ADMIN_SECRET_KEY];

export const JWT_SECRET =
  process.env.JWT_SECRET || crypto.randomBytes(32).toString("hex");
export const JWT_EXPIRY = process.env.JWT_EXPIRY || "24h";

if (!ADMIN_KEYS[0]) {
  console.error("❌ ADMIN_SECRET_KEY or ADMIN_KEYS must be set in .env");
  process.exit(1);
}

console.log(`✅ Admin auth configured with ${ADMIN_KEYS.length} key(s)`);
