import { Router } from "express";
import Team from "../mongodb/teamSchema.mjs";
import Voter from "../mongodb/voterSchema.mjs";
import { requireAuth } from "../middleware/auth-cookie.mjs";
import mongoose from "mongoose";

const route = Router();

class VoteOutcome extends Error {
  constructor(status, body) {
    super("Vote request completed without a write");
    this.status = status;
    this.body = body;
  }
}

route.post("/api/vote/:id", requireAuth, async (req, res) => {
  const teamId = req.params.id;
  const { vote } = req.body;
  const voterId = req.voter?._id;

  if (!["yes", "no"].includes(vote)) {
    return res.status(400).json({
      voted: false,
      message: "Vote must be 'yes' or 'no'",
    });
  }

  if (!mongoose.isValidObjectId(teamId)) {
    return res.status(400).json({
      voted: false,
      message: "Invalid team ID",
    });
  }

  let session;
  try {
    session = await mongoose.startSession();
    const result = await session.withTransaction(async () => {
      const presentingTeam = await Team.findOne(
        {
          _id: teamId,
          $or: [
            { state: "voting" },
            { state: { $exists: false }, presenting: true },
          ],
        },
        { _id: 1 },
        { session }
      ).lean();

      if (!presentingTeam) {
        throw new VoteOutcome(400, {
          voted: false,
          message: "This team is not currently presenting",
        });
      }

      const voter = await Voter.findOneAndUpdate(
        {
          _id: voterId,
          [`votes.${teamId}`]: { $exists: false },
        },
        {
          $set: { [`votes.${teamId}`]: { vote, votedAt: new Date() } },
        },
        { new: true, session }
      );

      if (!voter) {
        const existingVoter = await Voter.findById(voterId, null, { session });
        if (existingVoter?.votes.has(teamId)) {
          throw new VoteOutcome(400, {
            voted: false,
            message: "You have already voted for this team",
            existingVote: existingVoter.votes.get(teamId).vote,
          });
        }
        throw new VoteOutcome(404, { voted: false, message: "Voter not found" });
      }

      const teamUpdate = await Team.updateOne(
        {
          _id: teamId,
          $or: [
            { state: "voting" },
            { state: { $exists: false }, presenting: true },
          ],
        },
        { $inc: { [vote === "yes" ? "nyes" : "nno"]: 1 } },
        { session }
      );

      if (teamUpdate.matchedCount !== 1) {
        throw new Error("The presenting team is no longer available");
      }

      return {
        status: 200,
        body: { voted: true, message: "Vote recorded successfully", vote },
      };
    });

    return res.status(result.status).json(result.body);
  } catch (error) {
    if (error instanceof VoteOutcome) {
      return res.status(error.status).json(error.body);
    }

    console.error("Error recording vote:", error);
    return res.status(500).json({
      voted: false,
      message: "Server error",
    });
  } finally {
    if (session) {
      await session.endSession();
    }
  }
});

export default route;
