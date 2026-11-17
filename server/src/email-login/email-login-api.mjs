import { Router } from "express";
import rateLimit from "express-rate-limit";
import Voter from "../mongodb/voterSchema.mjs";
import { requireAdmin } from "../admin/middleware/requireAdmin.mjs";
import {
  createParticipantToken,
  hashParticipantToken,
  PARTICIPANT_SESSION_MAX_AGE,
} from "../middleware/participant-session.mjs";
import { shouldUseSecureCookies } from "../config/cookies.mjs";
import {
  findOrCreateEmailVoter,
  getAllowedDomains,
  isEmailAllowed,
  issueLoginCode,
  normalizeEmail,
  verifyLoginCode,
} from "./email-login.mjs";
import { isMailerConfigured, sendLoginCode } from "./mailer.mjs";
import { isLoginOpen, requireLoginOpen, setLoginOpen } from "./login-window.mjs";

const route = Router();
const loginMustBeOpen = requireLoginOpen();

const limitHandler = (req, res) => {
  const resetTime = req.rateLimit?.resetTime?.getTime() || Date.now() + 60_000;
  const retryAfterSeconds = Math.max(1, Math.ceil((resetTime - Date.now()) / 1000));
  res.set("Retry-After", String(retryAfterSeconds));
  return res.status(429).json({
    status: "failed",
    message: "Too many attempts. Please try again later.",
    retryAfterSeconds,
  });
};

// Per client IP. A whole auditorium may share one IP, so these are generous;
// per-address limits live in issueLoginCode/verifyLoginCode.
const requestCodeLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.EMAIL_CODE_REQUESTS_PER_IP || 2000),
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: limitHandler,
});

const verifyCodeLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.EMAIL_CODE_FAILURES_PER_IP || 500),
  skipSuccessfulRequests: true,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: limitHandler,
});

route.post("/api/login/email/request", requestCodeLimit, loginMustBeOpen, async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  if (!email) {
    return res.status(400).json({ status: "failed", message: "Enter a valid email address." });
  }

  try {
    if (!(await isEmailAllowed(email))) {
      return res.status(403).json({
        status: "failed",
        code: "NOT_ON_LIST",
        message: "This email is not on the voter list. Check for typos or ask the organizers.",
      });
    }

    const issued = await issueLoginCode(email);
    if (issued.error) {
      return res.status(429).json({
        status: "failed",
        code: issued.error,
        message:
          issued.error === "COOLDOWN"
            ? "A code was just sent. Check your inbox and spam folder."
            : "Too many codes requested for this email. Please wait.",
        retryAfterSeconds: issued.retryAfterSeconds,
      });
    }

    await sendLoginCode(email, issued.code);
    return res.status(200).json({ status: "sent" });
  } catch (error) {
    console.error(
      JSON.stringify({ event: "login_code_send_failed", requestId: req.requestId, message: error.message })
    );
    return res.status(503).json({
      status: "failed",
      message: "We could not send the email right now. Please try again in a moment.",
    });
  }
});

route.post("/api/login/email/verify", verifyCodeLimit, loginMustBeOpen, async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const code = typeof req.body?.code === "string" ? req.body.code.trim() : req.body?.code;
  if (!email) {
    return res.status(400).json({ status: "failed", message: "Enter a valid email address." });
  }

  try {
    const result = await verifyLoginCode(email, code);
    if (!result.ok) {
      const messages = {
        INVALID_CODE: "Wrong code. Check the 6 digits in the email.",
        CODE_EXPIRED_OR_LOCKED: "This code expired or had too many wrong tries. Request a new one.",
        NO_CODE: "Request a code first.",
      };
      return res.status(400).json({
        status: "failed",
        code: result.error,
        message: messages[result.error],
        attemptsLeft: result.attemptsLeft,
      });
    }

    const voter = await findOrCreateEmailVoter(email);
    if (!voter) {
      return res.status(403).json({
        status: "failed",
        code: "NOT_ON_LIST",
        message: "This email is not on the voter list.",
      });
    }

    const token = createParticipantToken();
    voter.participantSessionHash = hashParticipantToken(token);
    voter.participantSessionExpiresAt = new Date(Date.now() + PARTICIPANT_SESSION_MAX_AGE);
    await voter.save();

    res.cookie("connectionCookie", token, {
      maxAge: PARTICIPANT_SESSION_MAX_AGE,
      secure: shouldUseSecureCookies(),
      httpOnly: true,
      sameSite: "lax",
      signed: true,
    });
    return res.status(201).json({ status: "succeeded" });
  } catch (error) {
    console.error("Email login verify failed:", error.message);
    return res.status(500).json({ status: "failed", message: "Server error. Please try again." });
  }
});

// Public: lets the login page show "login is closed".
route.get("/api/login/status", async (req, res) => {
  try {
    return res.json({ open: await isLoginOpen() });
  } catch (error) {
    console.error("Error reading login window:", error.message);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

route.put("/api/admin/login-window", requireAdmin, async (req, res) => {
  if (typeof req.body?.open !== "boolean") {
    return res.status(400).json({ message: "open must be true or false" });
  }
  try {
    const open = await setLoginOpen(req.body.open, req.admin?.username || null);
    return res.json({ success: true, open, message: open ? "Login is open" : "Login is closed" });
  } catch (error) {
    console.error("Error updating login window:", error.message);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

// ---- admin: voter email list ----

route.get("/api/admin/voters/summary", requireAdmin, async (req, res) => {
  try {
    const [emailVoters, totalVoters] = await Promise.all([
      Voter.countDocuments({ email: { $exists: true } }),
      Voter.countDocuments(),
    ]);
    return res.json({
      loginOpen: await isLoginOpen({ fresh: true }),
      emailVoters,
      codeVoters: totalVoters - emailVoters,
      allowedDomains: getAllowedDomains(),
      mailerConfigured: isMailerConfigured(),
    });
  } catch (error) {
    console.error("Error reading voter summary:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

route.post("/api/admin/voters/emails", requireAdmin, async (req, res) => {
  const raw = req.body?.emails;
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 10_000) {
    return res.status(400).json({ message: "Send a list of 1 to 10,000 emails." });
  }

  const valid = new Set();
  const invalid = [];
  for (const entry of raw) {
    const email = normalizeEmail(entry);
    if (email) {
      valid.add(email);
    } else if (typeof entry === "string" && entry.trim()) {
      invalid.push(entry.trim().slice(0, 100));
    }
  }

  if (valid.size === 0) {
    return res.status(400).json({ message: "No valid email found.", invalid: invalid.slice(0, 50) });
  }

  try {
    const result = await Voter.bulkWrite(
      [...valid].map((email) => ({
        updateOne: {
          filter: { email },
          update: { $setOnInsert: { email, votes: {} } },
          upsert: true,
        },
      })),
      { ordered: false }
    );
    return res.json({
      success: true,
      added: result.upsertedCount,
      alreadyListed: valid.size - result.upsertedCount,
      invalidCount: invalid.length,
      invalid: invalid.slice(0, 50),
    });
  } catch (error) {
    console.error("Error importing voter emails:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

export default route;
