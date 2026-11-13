import { Router } from "express";
import Voter from "../mongodb/voterSchema.mjs";
import {
  createParticipantToken,
  hashParticipantToken,
  isValidVoterCode,
  PARTICIPANT_SESSION_MAX_AGE,
} from "../middleware/participant-session.mjs";

const route = Router();

route.post("/api/register", async (req, res) => {
  const userCode = req.body?.code;

  if (!isValidVoterCode(userCode)) {
    return res.status(400).json({ status: "failed", message: "Invalid code" });
  }

  const user = await Voter.findOne({ code: userCode });

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
        secure: process.env.NODE_ENV === "production",
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
