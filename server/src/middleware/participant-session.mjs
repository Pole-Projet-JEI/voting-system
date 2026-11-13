import crypto from "crypto";
import Voter from "../mongodb/voterSchema.mjs";

export const PARTICIPANT_SESSION_MAX_AGE = 1000 * 60 * 60 * 24;
const PARTICIPANT_TOKEN_PATTERN = /^[a-f0-9]{64}$/;

export const isValidVoterCode = (code) =>
  typeof code === "string" && /^[A-Za-z0-9]{9}$/.test(code);

export const createParticipantToken = () =>
  crypto.randomBytes(32).toString("hex");

export const hashParticipantToken = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");

export const getParticipantToken = (req) => {
  const token = req.signedCookies?.connectionCookie;
  return typeof token === "string" && PARTICIPANT_TOKEN_PATTERN.test(token)
    ? token
    : null;
};

export const findAuthenticatedVoter = async (req) => {
  const token = getParticipantToken(req);

  if (!token) {
    return null;
  }

  return Voter.findOne({
    participantSessionHash: hashParticipantToken(token),
    participantSessionExpiresAt: { $gt: new Date() },
  });
};
