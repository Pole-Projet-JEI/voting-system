import { Router } from "express";
import Team from "../mongodb/teamSchema.mjs";

const route = Router();

route.get("/api/currentteam", async (req, res) => {
  try {
    const presentingTeam = await Team.findOne({
      $or: [{ state: { $in: ["presenting", "voting"] } }, { presenting: true }],
    });

    if (!presentingTeam) {
      return res.status(200).json({
        teamID: null,
        teamName: null,
        description: null,
        message: "No team is currently presenting",
      });
    }

    return res.status(200).json({
      teamID: presentingTeam._id,
      teamName: presentingTeam.teamName,
      description: presentingTeam.description,
      state: presentingTeam.state || (presentingTeam.presenting ? "voting" : "pending"),
    });
  } catch (error) {
    console.error("Error in /api/currentteam:", error);
    return res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
});

export default route;
