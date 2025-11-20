import { Router } from "express";
import {
  changePresentingTeam,
  getCurrentPresentingTeam,
  stopPresenting,
} from "../services/presentingService.mjs";

const route = Router();

/**
 * Change the presenting team
 * POST /api/admin/presenting
 * Body: { teamId: string }
 */
route.post("/api/admin/presenting", async (req, res) => {
  try {
    const { teamId } = req.body;

    if (!teamId) {
      return res.status(400).json({ message: "Team ID is required" });
    }

    const newPresentingTeam = await changePresentingTeam(teamId);

    return res.json({
      success: true,
      message: `Team "${newPresentingTeam.teamName}" is now presenting`,
      team: newPresentingTeam,
    });
  } catch (error) {
    console.error("Error changing presenting team:", error);

    if (error.message === "Team not found") {
      return res.status(404).json({ message: "Team not found" });
    }

    if (error.message === "Team has already presented") {
      return res.status(400).json({ message: "Team has already presented" });
    }

    return res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
  }
});

/**
 * Get current presenting team
 * GET /api/admin/presenting
 */
route.get("/api/admin/presenting", async (req, res) => {
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

/**
 * Stop presenting
 * DELETE /api/admin/presenting
 */
route.delete("/api/admin/presenting", async (req, res) => {
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
