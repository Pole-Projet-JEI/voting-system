import { Router } from "express";
import Team from "../mongodb/teamSchema.mjs";
import Voter from "../mongodb/voterSchema.mjs";
import { requireAuth } from "../middleware/auth-cookie.mjs";

const route = Router();

route.post("/api/vote/:id", requireAuth, async (req, res) => {
  const teamId = req.params.id;
  const { vote } = req.body;
  const voterCode = req.voterCode;

  if (!["yes", "no"].includes(vote)) {
    return res.status(400).json({
      voted: false,
      message: "Vote must be 'yes' or 'no'",
    });
  }

  try {
    // 1. Pre-validate before transaction - check if team is presenting
    const presentingTeam = await Team.findOne(
      { _id: teamId, presenting: true },
      { _id: 1 }
    ).lean(); // Single query, no transaction needed

    if (!presentingTeam) {
      return res.status(400).json({
        voted: false,
        message: "This team is not currently presenting",
      });
    }

    // 2. Use optimistic concurrency control instead of transactions
    const voter = await Voter.findOneAndUpdate(
      {
        code: voterCode,
        [`votes.${teamId}`]: { $exists: false }, // Atomic duplicate check
      },
      {
        $set: { [`votes.${teamId}`]: { vote, votedAt: new Date() } },
      },
      { new: true }
    );

    if (!voter) {
      // Either voter doesn't exist or already voted
      const existingVoter = await Voter.findOne({ code: voterCode });
      if (existingVoter?.votes.has(teamId)) {
        return res.status(400).json({
          voted: false,
          message: "You have already voted for this team",
          existingVote: existingVoter.votes.get(teamId).vote,
        });
      }
      return res.status(404).json({
        voted: false,
        message: "Voter not found",
      });
    }

    // 3. Increment team vote atomically (no transaction needed)
    await Team.updateOne(
      { _id: teamId },
      { $inc: { [vote === "yes" ? "nyes" : "nno"]: 1 } }
    );

    return res.status(200).json({
      voted: true,
      message: "Vote recorded successfully",
      vote: vote,
    });
  } catch (error) {
    console.error("Error recording vote:", error);
    return res.status(500).json({
      voted: false,
      message: "Server error",
      error: error.message,
    });
  }
});

export default route;
