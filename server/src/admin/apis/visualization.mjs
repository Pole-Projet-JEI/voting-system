import { Router } from "express";
import {
  getAllTeams,
  getTeamById,
  getAllVoters,
  getVoterStats,
  getTeamStats,
} from "../services/visualizationService.mjs";

const route = Router();

route.get("/api/admin/teams", async (req, res) => {
  try {
    const teams = await getAllTeams();

    return res.json({
      count: teams.length,
      teams,
    });
  } catch (error) {
    console.error("Error fetching teams:", error);
    return res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
  }
});

export default route;
