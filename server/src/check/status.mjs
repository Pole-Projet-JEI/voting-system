import { Router } from "express";
import { findAuthenticatedVoter } from "../middleware/participant-session.mjs";
const route = Router();

route.get("/api/isconnected", async (req, res) => {
  try {
    const voter = await findAuthenticatedVoter(req);
    return res.json({ connected: Boolean(voter) });
  } catch (error) {
    console.error("Error checking voter connection:", error);
    return res.status(500).json({ connected: false, error: "Database error" });
  }
});

export default route;
