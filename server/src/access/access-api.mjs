import { Router } from "express";
import mongoose from "mongoose";
import rateLimit from "express-rate-limit";
import Voter from "../mongodb/voterSchema.mjs";
import Team from "../mongodb/teamSchema.mjs";
import { OPENED_TEAM_FILTER } from "../admin/services/officialResultsService.mjs";
import { requireAdmin } from "../admin/middleware/requireAdmin.mjs";
import {
  createParticipantToken,
  findAuthenticatedVoter,
  hashParticipantToken,
  PARTICIPANT_SESSION_MAX_AGE,
} from "../middleware/participant-session.mjs";
import { shouldUseSecureCookies } from "../config/cookies.mjs";
import {
  getLoginSettings,
  getScreenKey,
  isLoginOpen,
  isScreenKey,
  rotateScreenKey,
  updateLoginSettings,
} from "./login-window.mjs";
import { createQrToken, getQrGraceSeconds, verifyQrToken } from "./qr-token.mjs";

const route = Router();

// Two ways to join, chosen per deployment with ACCESS_MODE:
//
//   "link" (default): opening the voting link gives the browser an anonymous
//     voter session (random id in an httpOnly signed cookie). Presence is
//     enforced by the venue location check on every vote. The device cookie
//     remembers which voter this browser is, so an expired session on the
//     same phone gives back the same voter.
//
//   "qr-email": the projector shows a QR code that changes every 15 s.
//     Scanning it (POST /api/join/scan with the token) gives the phone a
//     10-minute pass, so the voter has time to type an email. POST /api/join
//     with the email then needs that pass. The email (not verified) is the
//     voter's identity: the same email on two phones is the same voter.
//
// In both modes only voters who voted for every team are counted in the
// official results.
export const DEVICE_COOKIE = "voterDevice";
export const SCAN_COOKIE = "qrPass";
const DEVICE_MAX_AGE = 1000 * 60 * 60 * 24 * 7;
export const SCAN_PASS_MAX_AGE = 1000 * 60 * 10;

export const getAccessMode = () => (process.env.ACCESS_MODE === "qr-email" ? "qr-email" : "link");

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const normalizeEmail = (value) => {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return email.length <= 254 && EMAIL_PATTERN.test(email) ? email : null;
};

const cookieBase = () => ({
  secure: shouldUseSecureCookies(),
  httpOnly: true,
  sameSite: "lax",
  signed: true,
});

const limitHandler = (req, res) => {
  const resetTime = req.rateLimit?.resetTime?.getTime() || Date.now() + 60_000;
  const retryAfterSeconds = Math.max(1, Math.ceil((resetTime - Date.now()) / 1000));
  res.set("Retry-After", String(retryAfterSeconds));
  return res.status(429).json({
    status: "failed",
    message: "Trop de tentatives. Réessayez plus tard.",
    retryAfterSeconds,
  });
};

// Per client IP. The whole auditorium may share one IP, so this is generous.
const joinLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.JOIN_REQUESTS_PER_IP || 3000),
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: limitHandler,
});

const joinFailureMessages = {
  QR_EXPIRED: "Scan the QR code shown on the screen again.",
  QR_INVALID: "This link is not valid. Scan the QR code on the screen.",
  QR_REQUIRED: "Scan the QR code shown on the screen to vote.",
  EMAIL_INVALID: "Enter a valid email address.",
  EMAIL_TAKEN: "This email has already been used. Each email can join only once.",
};

const fail = (res, status, code) =>
  res.status(status).json({ status: "failed", code, message: joinFailureMessages[code] });

const loginClosed = (res) =>
  res.status(403).json({
    status: "failed",
    code: "LOGIN_CLOSED",
    message: "La connexion est fermée. Attendez que les organisateurs l'ouvrent.",
  });

// Scan pass: signed cookie holding the time of the scan.
export const hasValidScanPass = (req, now = Date.now()) => {
  const value = req.signedCookies?.[SCAN_COOKIE];
  const scannedAt = typeof value === "string" && /^\d{13}$/.test(value) ? Number(value) : NaN;
  return scannedAt <= now + 5_000 && now - scannedAt < SCAN_PASS_MAX_AGE;
};

// Each email can join only once: the first phone that types it owns it.
// Returns null when the email is already taken (even at the same instant:
// the unique index lets only one create succeed).
const claimEmailVoter = async (email) => {
  try {
    return await Voter.create({ email });
  } catch (error) {
    if (error?.code === 11000) return null;
    throw error;
  }
};

const findDeviceVoter = async (req) => {
  const id = req.signedCookies?.[DEVICE_COOKIE];
  if (typeof id !== "string" || !mongoose.isValidObjectId(id)) {
    return null;
  }
  return Voter.findById(id);
};

const startSession = async (res, voter) => {
  const token = createParticipantToken();
  voter.participantSessionHash = hashParticipantToken(token);
  voter.participantSessionExpiresAt = new Date(Date.now() + PARTICIPANT_SESSION_MAX_AGE);
  await voter.save();
  res.cookie("connectionCookie", token, {
    ...cookieBase(),
    maxAge: PARTICIPANT_SESSION_MAX_AGE,
  });
};

export const createJoinHandler =
  ({
    findSessionVoter = findAuthenticatedVoter,
    findDevice = findDeviceVoter,
    findByEmail = claimEmailVoter,
    createVoter = () => Voter.create({}),
    checkOpen = isLoginOpen,
    mode = getAccessMode,
    scanPassOk = hasValidScanPass,
  } = {}) =>
  async (req, res) => {
    try {
      // Already joined on this phone: nothing to do.
      if (await findSessionVoter(req)) {
        return res.status(200).json({ status: "succeeded", reused: true });
      }

      if (!(await checkOpen())) {
        return loginClosed(res);
      }

      if (mode() === "qr-email") {
        if (!scanPassOk(req)) {
          return fail(res, 403, "QR_REQUIRED");
        }
        const email = normalizeEmail(req.body?.email);
        if (!email) {
          return fail(res, 400, "EMAIL_INVALID");
        }
        const voter = await findByEmail(email);
        if (!voter) {
          return fail(res, 409, "EMAIL_TAKEN");
        }
        await startSession(res, voter);
        res.clearCookie(SCAN_COOKIE, cookieBase());
        return res.status(201).json({ status: "succeeded" });
      }

      const known = await findDevice(req);
      const voter = known || (await createVoter());
      await startSession(res, voter);
      res.cookie(DEVICE_COOKIE, String(voter._id), {
        ...cookieBase(),
        maxAge: DEVICE_MAX_AGE,
      });
      return res.status(201).json({ status: "succeeded", reused: Boolean(known) });
    } catch (error) {
      console.error(
        JSON.stringify({ event: "session_join_failed", requestId: req.requestId, message: error.message })
      );
      return res.status(500).json({ status: "failed", message: "Erreur du serveur. Réessayez." });
    }
  };

// qr-email mode: checks the token from the QR code and gives the scan pass.
export const createScanHandler =
  ({ checkOpen = isLoginOpen, verify = verifyQrToken, mode = getAccessMode } = {}) =>
  async (req, res) => {
    try {
      if (mode() !== "qr-email") {
        return res.status(404).json({ status: "failed", message: "Introuvable" });
      }
      if (!(await checkOpen())) {
        return loginClosed(res);
      }
      const check = verify(req.body?.t);
      if (!check.ok) {
        return fail(res, check.error === "QR_EXPIRED" ? 410 : 400, check.error);
      }
      res.cookie(SCAN_COOKIE, String(Date.now()), { ...cookieBase(), maxAge: SCAN_PASS_MAX_AGE });
      return res.status(200).json({ status: "succeeded", passSeconds: SCAN_PASS_MAX_AGE / 1000 });
    } catch (error) {
      console.error(
        JSON.stringify({ event: "qr_scan_failed", requestId: req.requestId, message: error.message })
      );
      return res.status(500).json({ status: "failed", message: "Erreur du serveur. Réessayez." });
    }
  };

route.post("/api/join/scan", joinLimit, createScanHandler());
route.post("/api/join", joinLimit, createJoinHandler());

// Public: lets the waiting page show "login is closed".
route.get("/api/login/status", async (req, res) => {
  try {
    return res.json({ open: (await getLoginSettings()).open, mode: getAccessMode() });
  } catch (error) {
    console.error("Error reading login window:", error.message);
    return res.status(500).json({ message: "Erreur interne du serveur" });
  }
});

// The current join token for the projector: { open, path, expiresAt, ... }.
const currentQrPayload = async () => {
  const { open } = await getLoginSettings({ fresh: true });
  if (!open) {
    return { open: false };
  }
  const { token, expiresAt, periodSeconds } = createQrToken();
  return {
    open: true,
    path: `/join?t=${token}`,
    expiresAt,
    periodSeconds,
    graceSeconds: getQrGraceSeconds(),
    serverTime: Date.now(),
  };
};

// Admin screen (qr-email mode): the current join token. The client builds the
// link from its own origin and fetches again at expiresAt.
route.get("/api/admin/access-qr", requireAdmin, async (req, res) => {
  try {
    if (getAccessMode() !== "qr-email") {
      return res.status(404).json({ message: "L'accès par QR code n'est pas activé" });
    }
    res.set("Cache-Control", "no-store");
    return res.json(await currentQrPayload());
  } catch (error) {
    console.error("Error creating access QR:", error.message);
    return res.status(500).json({ message: "Erreur interne du serveur" });
  }
});

// Public projector screen, no login: /qr/<key> shows the same rotating QR
// code. Only the key protects it, so the admin can change the key.
const screenLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.SCREEN_REQUESTS_PER_IP || 600),
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: limitHandler,
});

export const createScreenHandler =
  ({ mode = getAccessMode, checkKey = isScreenKey, payload = currentQrPayload } = {}) =>
  async (req, res) => {
    try {
      res.set("Cache-Control", "no-store");
      if (mode() !== "qr-email" || !(await checkKey(req.params.key))) {
        return res.status(404).json({ message: "Lien d'écran invalide" });
      }
      return res.json(await payload());
    } catch (error) {
      console.error("Error serving screen QR:", error.message);
      return res.status(500).json({ message: "Erreur interne du serveur" });
    }
  };

route.get("/api/screen/:key", screenLimit, createScreenHandler());

route.get("/api/admin/screen-key", requireAdmin, async (req, res) => {
  try {
    return res.json({ key: await getScreenKey({ fresh: true }) });
  } catch (error) {
    console.error("Error reading screen key:", error.message);
    return res.status(500).json({ message: "Erreur interne du serveur" });
  }
});

// New key: the old public screen link stops working at once.
route.post("/api/admin/screen-key", requireAdmin, async (req, res) => {
  try {
    return res.json({ key: await rotateScreenKey(req.admin?.username || null) });
  } catch (error) {
    console.error("Error changing screen key:", error.message);
    return res.status(500).json({ message: "Erreur interne du serveur" });
  }
});

route.put("/api/admin/login-window", requireAdmin, async (req, res) => {
  if (typeof req.body?.open !== "boolean") {
    return res.status(400).json({ message: "open doit valoir true ou false" });
  }
  try {
    const settings = await updateLoginSettings({ open: req.body.open }, req.admin?.username || null);
    return res.json({
      success: true,
      ...settings,
      message: settings.open ? "Connexion ouverte" : "Connexion fermée",
    });
  } catch (error) {
    console.error("Error updating login window:", error.message);
    return res.status(500).json({ message: "Erreur interne du serveur" });
  }
});

route.get("/api/admin/voters/summary", requireAdmin, async (req, res) => {
  try {
    const [voters, settings] = await Promise.all([
      Voter.countDocuments(),
      getLoginSettings({ fresh: true }),
    ]);
    return res.json({ loginOpen: settings.open, voters, mode: getAccessMode() });
  } catch (error) {
    console.error("Error reading voter summary:", error);
    return res.status(500).json({ message: "Erreur interne du serveur" });
  }
});

// Per-voter list (email and how many teams they voted for), for the admin.
// Same rule as the official results: only teams whose voting has opened
// count, so totalTeams is that number and teamsVoted counts votes on them.
route.get("/api/admin/voters", requireAdmin, async (req, res) => {
  try {
    const [voters, openedTeams] = await Promise.all([
      Voter.find({}, { email: 1, votes: 1, createdAt: 1 }).sort({ createdAt: 1 }).lean(),
      Team.find(OPENED_TEAM_FILTER, { _id: 1 }).lean(),
    ]);
    const opened = new Set(openedTeams.map((team) => String(team._id)));
    res.set("Cache-Control", "no-store");
    return res.json({
      totalTeams: opened.size,
      voters: voters.map((voter) => {
        const votes = Object.entries(voter.votes || {})
          .filter(([teamId]) => opened.has(teamId))
          .map(([, vote]) => vote);
        return {
          id: String(voter._id),
          email: voter.email || null,
          joinedAt: voter.createdAt,
          teamsVoted: votes.length,
          yes: votes.filter((v) => v.vote === "yes").length,
          no: votes.filter((v) => v.vote === "no").length,
        };
      }),
    });
  } catch (error) {
    console.error("Error listing voters:", error);
    return res.status(500).json({ message: "Erreur interne du serveur" });
  }
});

export default route;
