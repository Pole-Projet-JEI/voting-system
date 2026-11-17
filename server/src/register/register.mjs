import { Router } from "express";
import Voter from "../mongodb/voterSchema.mjs";
import {
  createParticipantToken,
  hashParticipantToken,
  isValidVoterCode,
  PARTICIPANT_SESSION_MAX_AGE,
} from "../middleware/participant-session.mjs";
import { shouldUseSecureCookies } from "../config/cookies.mjs";
import { voterRegistrationRateLimit } from "../middleware/rate-limiters.mjs";
import { hashVoterCode } from "../mongodb/voter-code.mjs";

const route = Router();

// Legacy paper-code login. Disabled unless ENABLE_CODE_LOGIN=true, so it
// cannot bypass email login and the admin login window.
export const isCodeLoginEnabled = () => process.env.ENABLE_CODE_LOGIN === "true";

route.post("/api/register", voterRegistrationRateLimit, async (req, res) => {
  if (!isCodeLoginEnabled()) {
    return res.status(410).json({
      status: "failed",
      code: "CODE_LOGIN_DISABLED",
      message: "Code login is disabled. Log in with your email.",
    });
  }
  const userCode = req.body?.code;

  if (!isValidVoterCode(userCode)) {
    return res.status(400).json({ status: "failed", message: "Invalid code" });
  }

  const user = await Voter.findOne({ codeHash: hashVoterCode(userCode) });

  if (user) {
    const participantToken = createParticipantToken();
    user.participantSessionHash = hashParticipantToken(participantToken);
    user.participantSessionExpiresAt = new Date(
      Date.now() + PARTICIPANT_SESSION_MAX_AGE
    );
    await user.save();

    res.cookie(
      "connectionCookie",
      participantToken,
      {
        maxAge: PARTICIPANT_SESSION_MAX_AGE,
        secure: shouldUseSecureCookies(),
        httpOnly: true,
        sameSite: "lax",
        signed: true,
      }
    );
    return res.status(201).json({ status: "succeeded" });
  } else {
    return res.status(400).json({ status: "failed",message:"Invalid code" });
  }
});

export default route;
