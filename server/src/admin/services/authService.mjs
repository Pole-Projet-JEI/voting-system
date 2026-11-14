import crypto from "crypto";
import jwt from "jsonwebtoken";
import { promisify } from "node:util";
import Admin from "../../mongodb/adminSchema.mjs";
import { ADMIN_KEYS, JWT_SECRET, JWT_EXPIRY } from "../../config/secrets.mjs";

const scrypt = promisify(crypto.scrypt);

export function validateAdminKey(secretKey) {
  return ADMIN_KEYS.includes(secretKey);
}

export async function hashAdminPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derivedKey = await scrypt(password, salt, 64);
  return `scrypt$${salt}$${Buffer.from(derivedKey).toString("hex")}`;
}

export async function verifyAdminPassword(password, passwordHash) {
  const [algorithm, salt, expectedHash] = passwordHash.split("$");
  if (algorithm !== "scrypt" || !salt || !expectedHash) {
    return false;
  }

  const actualHash = Buffer.from(await scrypt(password, salt, 64));
  const expectedBuffer = Buffer.from(expectedHash, "hex");
  return (
    expectedBuffer.length === actualHash.length &&
    crypto.timingSafeEqual(actualHash, expectedBuffer)
  );
}

export async function authenticateAdmin(username, password) {
  if (!username || !password) {
    return { valid: false };
  }

  const admin = await Admin.findOne({ username }).select("+passwordHash");
  if (admin) {
    return {
      valid: await verifyAdminPassword(password, admin.passwordHash),
      username: admin.username,
      mustChangePassword: admin.mustChangePassword,
    };
  }

  const configuredUsername = process.env.ADMIN_USERNAME;
  const configuredPassword = process.env.ADMIN_PASSWORD;
  if (
    configuredUsername &&
    configuredPassword &&
    username === configuredUsername &&
    password === configuredPassword
  ) {
    return {
      valid: true,
      username,
      mustChangePassword: true,
    };
  }

  return { valid: false };
}

export function generateAdminToken(
  username = "legacy-admin",
  mustChangePassword = false
) {
  return jwt.sign(
    {
      role: "admin",
      username,
      mustChangePassword,
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
