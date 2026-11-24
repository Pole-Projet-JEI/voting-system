import { Router } from "express";
import Team from "../mongodb/teamSchema.mjs";
import { requireAuth } from "../middleware/auth-cookie.mjs";

const route = Router();

route.get("/api/hasvoted", requireAuth, async (req, res) => {
  try {
    const voter = req.voter;

    const presentingTeam = await Team.findOne({ presenting: true });

    if (!presentingTeam) {
      return res.json({
        hasVoted: false,
        message: "Aucune équipe ne présente en ce moment",
      });
    }

    const teamId = presentingTeam._id.toString();

    const hasVoted = voter.votes.has(teamId);

    return res.json({
      hasVoted,
      teamId,
      vote: hasVoted ? voter.votes.get(teamId).vote : null,
      votedAt: hasVoted ? voter.votes.get(teamId).votedAt : null,
    });
  } catch (error) {
    console.error("Error checking vote status:", error);
    return res.status(500).json({
      hasVoted: false,
      message: "Erreur interne du serveur",
      error: error.message,
    });
  }
});

export default route;
