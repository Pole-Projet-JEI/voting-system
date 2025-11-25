import { Router } from "express";
import {
  changePresentingTeam,
  getCurrentPresentingTeam,
  stopPresenting,
} from "../services/presentingService.mjs";
import { requireAdmin } from "../middleware/requireAdmin.mjs";

const route = Router();

route.post("/api/admin/presenting", requireAdmin, async (req, res) => {
  try {
    const { teamId } = req.body;

    if (!teamId) {
      return res.status(400).json({ message: "Team ID is required" });
    }

    const result = await changePresentingTeam(teamId);

    if (result.error) {
      if (result.error.includes("not found")) {
        return res.status(404).json({ message: "Team not found" });
      }
      if (result.error.includes("already presented")) {
        return res.status(400).json({ message: "Team has already presented" });
      }
      return res.status(500).json({ message: result.error });
    }

    return res.json({
      success: true,
      message: `Team "${result.teamName}" is now presenting`,
      team: result,
    });
  } catch (error) {
    console.error("Error changing presenting team:", error);
    return res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
  }
});

route.get("/api/admin/presenting", requireAdmin, async (req, res) => {
  try {
    const presentingTeam = await getCurrentPresentingTeam();

    if (!presentingTeam) {
      return res.json({
        presenting: false,
        team: null,
      });
    }

    return res.json({
      presenting: true,
      team: presentingTeam,
    });
  } catch (error) {
    console.error("Error getting presenting team:", error);
    return res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
  }
});

route.delete("/api/admin/presenting", requireAdmin, async (req, res) => {
  try {
    const previousTeam = await stopPresenting();

    if (!previousTeam) {
      return res.json({
        message: "No team was presenting",
      });
    }

    return res.json({
      success: true,
      message: `Team "${previousTeam.teamName}" is no longer presenting`,
      team: previousTeam,
    });
  } catch (error) {
    console.error("Error stopping presentation:", error);
    return res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
  }
});

export default route;
