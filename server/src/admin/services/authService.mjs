import jwt from "jsonwebtoken";
import { ADMIN_KEYS, JWT_SECRET, JWT_EXPIRY } from "../../config/secrets.mjs";

export function validateAdminKey(secretKey) {
  return ADMIN_KEYS.includes(secretKey);
}

export function generateAdminToken() {
  return jwt.sign(
    {
      role: "admin",
      timestamp: Date.now(),
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY }
  );
}

export function verifyAdminToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}
