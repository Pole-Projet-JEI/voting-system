import { Router } from "express";
import Voter from "../mongodb/voterSchema.mjs";

const route = Router();

route.post("/api/register", async (req, res) => {
  const userCode = req.body.code;
  console.log(userCode)

  const user = await Voter.findOne({ code: userCode });
  console.log(user)

  if (user) {
    res.cookie(
      "connectionCookie",
      { code: userCode },
      {
        maxAge: 1000 * 60 * 60 * 24,
        secure: false,
        httpOnly: true,
        sameSite: "lax",
      }
    );
    return res.status(201).json({ status: "succeeded" });
  } else {
    return res.status(201).json({ status: "failed" });
  }
});

export default route;
