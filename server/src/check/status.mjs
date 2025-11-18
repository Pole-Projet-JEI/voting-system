import { Router } from "express";
import Voter from "../mongodb/voterSchema.mjs";
const route = Router();

route.get("/api/isconnected", async (req, res) => {
  const { connectionCookie } = req.cookies;

  // Fix: Add null check to prevent crash
  if (!connectionCookie?.code) {
    return res.json({ connected: false });
  }

  try {
    const voter = await Voter.findOne({ code: connectionCookie.code });

    if (voter) {
      return res.json({ connected: true });
    }

    return res.json({ connected: false });
  } catch {
    console.error("Error checking voter connection:", error);
    return res.status(500).json({ connected: false, error: "Database error" });
  }
});

export default route;
