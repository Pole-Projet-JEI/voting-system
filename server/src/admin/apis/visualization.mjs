import { Router } from "express";
import { getAllTeams } from "../services/visualizationService.mjs";
import { requireAdmin } from "../middleware/requireAdmin.mjs";

const route = Router();

route.get("/api/admin/teams", requireAdmin, async (req, res) => {
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
