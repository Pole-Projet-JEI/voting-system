import { Router } from "express";
import mongoose from "mongoose";
import rateLimit from "express-rate-limit";
import Voter from "../mongodb/voterSchema.mjs";
import { requireAdmin } from "../admin/middleware/requireAdmin.mjs";
import {
  createParticipantToken,
  findAuthenticatedVoter,
  hashParticipantToken,
  PARTICIPANT_SESSION_MAX_AGE,
} from "../middleware/participant-session.mjs";
import { shouldUseSecureCookies } from "../config/cookies.mjs";
import { getLoginSettings, isLoginOpen, updateLoginSettings } from "./login-window.mjs";

const route = Router();

// Opening the voting link gives the browser an anonymous voter session
// (random id in an httpOnly signed cookie). There is no login form: presence
// is enforced by the venue location check on every vote, and only voters who
// voted for every team are counted in the official results.
//
// The device cookie remembers which voter this browser is, so an expired
// session on the same phone gives back the same voter instead of a new one.
export const DEVICE_COOKIE = "voterDevice";
const DEVICE_MAX_AGE = 1000 * 60 * 60 * 24 * 7;

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
    message: "Too many attempts. Please try again later.",
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

const findDeviceVoter = async (req) => {
  const id = req.signedCookies?.[DEVICE_COOKIE];
  if (typeof id !== "string" || !mongoose.isValidObjectId(id)) {
    return null;
  }
  return Voter.findById(id);
};

export const createJoinHandler =
  ({
    findSessionVoter = findAuthenticatedVoter,
    findDevice = findDeviceVoter,
    createVoter = () => Voter.create({}),
    checkOpen = isLoginOpen,
  } = {}) =>
  async (req, res) => {
    try {
      // Already joined on this phone: nothing to do.
      if (await findSessionVoter(req)) {
        return res.status(200).json({ status: "succeeded", reused: true });
      }

      if (!(await checkOpen())) {
        return res.status(403).json({
          status: "failed",
          code: "LOGIN_CLOSED",
          message: "Login is closed. Wait for the organizers to open it.",
        });
      }

      const known = await findDevice(req);
      const voter = known || (await createVoter());

      const token = createParticipantToken();
      voter.participantSessionHash = hashParticipantToken(token);
      voter.participantSessionExpiresAt = new Date(Date.now() + PARTICIPANT_SESSION_MAX_AGE);
      await voter.save();

      res.cookie("connectionCookie", token, {
        ...cookieBase(),
        maxAge: PARTICIPANT_SESSION_MAX_AGE,
      });
      res.cookie(DEVICE_COOKIE, String(voter._id), {
        ...cookieBase(),
        maxAge: DEVICE_MAX_AGE,
      });
      return res.status(201).json({ status: "succeeded", reused: Boolean(known) });
    } catch (error) {
      console.error(
        JSON.stringify({ event: "session_join_failed", requestId: req.requestId, message: error.message })
      );
      return res.status(500).json({ status: "failed", message: "Server error. Please try again." });
    }
  };

route.post("/api/join", joinLimit, createJoinHandler());

// Public: lets the waiting page show "login is closed".
route.get("/api/login/status", async (req, res) => {
  try {
    return res.json({ open: (await getLoginSettings()).open });
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
    const settings = await updateLoginSettings({ open: req.body.open }, req.admin?.username || null);
    return res.json({
      success: true,
      ...settings,
      message: settings.open ? "Login is open" : "Login is closed",
    });
  } catch (error) {
    console.error("Error updating login window:", error.message);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

route.get("/api/admin/voters/summary", requireAdmin, async (req, res) => {
  try {
    const [voters, settings] = await Promise.all([
      Voter.countDocuments(),
      getLoginSettings({ fresh: true }),
    ]);
    return res.json({ loginOpen: settings.open, voters });
  } catch (error) {
    console.error("Error reading voter summary:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

export default route;
