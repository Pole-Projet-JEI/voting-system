import crypto from "node:crypto";
import Voter from "../mongodb/voterSchema.mjs";
import LoginChallenge from "../mongodb/loginChallengeSchema.mjs";

export const CODE_TTL_MS = 10 * 60 * 1000;
export const RESEND_COOLDOWN_MS = 30 * 1000;
export const MAX_SENDS_PER_WINDOW = 5;
export const SEND_WINDOW_MS = 15 * 60 * 1000;
export const MAX_VERIFY_ATTEMPTS = 5;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const normalizeEmail = (value) => {
  if (typeof value !== "string") {
    return null;
  }
  const email = value.trim().toLowerCase();
  return email.length <= 254 && EMAIL_PATTERN.test(email) ? email : null;
};

// ALLOWED_EMAIL_DOMAINS="insat.ucar.tn,jeinsat.com" lets any address of those
// domains vote without being on the imported list.
export const getAllowedDomains = () =>
  (process.env.ALLOWED_EMAIL_DOMAINS || "")
    .split(",")
    .map((domain) => domain.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);

export const isDomainAllowed = (email, domains = getAllowedDomains()) => {
  const domain = email.split("@")[1];
  return domains.includes(domain);
};

export const generateLoginCode = () =>
  String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");

const getSecret = () => {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET must be configured");
  }
  return secret;
};

export const hashLoginCode = (email, code) =>
  crypto.createHmac("sha256", getSecret()).update(`${email}:${code}`).digest("hex");

const safeEqual = (a, b) =>
  a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

export const isEmailAllowed = async (email) =>
  isDomainAllowed(email) || Boolean(await Voter.exists({ email }));

// Creates or refreshes the pending code for an address, enforcing the resend
// cooldown and the per-address send limit. Returns { code } or { error, retryAfterSeconds }.
export const issueLoginCode = async (email, now = new Date()) => {
  const existing = await LoginChallenge.findOne({ email }).lean();

  if (existing) {
    const sinceLast = now - new Date(existing.lastSentAt);
    if (sinceLast < RESEND_COOLDOWN_MS) {
      return {
        error: "COOLDOWN",
        retryAfterSeconds: Math.ceil((RESEND_COOLDOWN_MS - sinceLast) / 1000),
      };
    }
    const windowOpen = now - new Date(existing.sendWindowStart) < SEND_WINDOW_MS;
    if (windowOpen && existing.sendsInWindow >= MAX_SENDS_PER_WINDOW) {
      return {
        error: "TOO_MANY_SENDS",
        retryAfterSeconds: Math.ceil(
          (SEND_WINDOW_MS - (now - new Date(existing.sendWindowStart))) / 1000
        ),
      };
    }
  }

  const code = generateLoginCode();
  const windowOpen =
    existing && now - new Date(existing.sendWindowStart) < SEND_WINDOW_MS;

  await LoginChallenge.updateOne(
    { email },
    {
      $set: {
        codeHash: hashLoginCode(email, code),
        expiresAt: new Date(now.getTime() + CODE_TTL_MS),
        attempts: 0,
        lastSentAt: now,
        sendWindowStart: windowOpen ? existing.sendWindowStart : now,
        sendsInWindow: windowOpen ? existing.sendsInWindow + 1 : 1,
      },
    },
    { upsert: true }
  );

  return { code };
};

// Checks a submitted code. Returns { ok: true } or { error }.
export const verifyLoginCode = async (email, code, now = new Date()) => {
  if (typeof code !== "string" || !/^\d{6}$/.test(code)) {
    return { error: "INVALID_CODE" };
  }

  // Count the attempt atomically before comparing, so parallel guesses
  // cannot exceed the limit.
  const challenge = await LoginChallenge.findOneAndUpdate(
    { email, expiresAt: { $gt: now }, attempts: { $lt: MAX_VERIFY_ATTEMPTS } },
    { $inc: { attempts: 1 } },
    { new: true }
  ).lean();

  if (!challenge) {
    const stale = await LoginChallenge.exists({ email });
    return { error: stale ? "CODE_EXPIRED_OR_LOCKED" : "NO_CODE" };
  }

  if (!safeEqual(challenge.codeHash, hashLoginCode(email, code))) {
    return {
      error: "INVALID_CODE",
      attemptsLeft: Math.max(0, MAX_VERIFY_ATTEMPTS - challenge.attempts),
    };
  }

  await LoginChallenge.deleteOne({ email });
  return { ok: true };
};

// Finds the voter for a verified address, creating it for allowed domains.
export const findOrCreateEmailVoter = async (email) => {
  const voter = await Voter.findOne({ email });
  if (voter) {
    return voter;
  }
  if (!isDomainAllowed(email)) {
    return null;
  }
  try {
    return await Voter.create({ email });
  } catch (error) {
    if (error.code === 11000) {
      return Voter.findOne({ email });
    }
    throw error;
  }
};
