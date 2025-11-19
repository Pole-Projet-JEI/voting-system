import { Router } from "express";
import mongoose from "mongoose";
import Team from "../mongodb/teamSchema.mjs";
import Voter from "../mongodb/voterSchema.mjs";
import CurrentVote from "../mongodb/currentVoteSchema.mjs";

const route = Router();

route.post("/api/vote/:id", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const teamId = req.params.id;
    const { vote } = req.body;
    const voterCode = req.voterCode;

    if (!["yes", "no"].includes(vote)) {
      await session.abortTransaction();
      return res.status(400).json({
        voted: false,
        message: "Vote must be 'yes' or 'no'",
      });
    }

    const currentVote = await CurrentVote.findOne().session(session);
    if (!currentVote || currentVote.teamID.toString() !== teamId) {
      await session.abortTransaction();
      return res.status(400).json({
        voted: false,
        message: "This team is not currently presenting",
      });
    }

    const team = await Team.findById(teamId).session(session);
    if (!team) {
      await session.abortTransaction();
      return res.status(404).json({
        voted: false,
        message: "Team not found",
      });
    }

    const voter = await Voter.findOne({ code: voterCode }).session(session);
    if (voter.votes.has(teamId)) {
      await session.abortTransaction();
      return res.status(400).json({
        voted: false,
        message: "You have already voted for this team",
        existingVote: voter.votes.get(teamId).vote,
      });
    }

    const updateField = vote === "yes" ? "nyes" : "nno";
    await Team.updateOne(
      { _id: teamId },
      { $inc: { [updateField]: 1 } },
      { session }
    );

    await Voter.updateOne(
      { code: voterCode },
      { $set: { [`votes.${teamId}`]: { vote, votedAt: new Date() } } },
      { session }
    );

    await session.commitTransaction();

    return res.status(200).json({
      voted: true,
      message: "Vote recorded successfully",
      vote: vote,
    });
  } catch (error) {
    await session.abortTransaction();
    console.error("Error recording vote:", error);

    return res.status(500).json({
      voted: false,
      message: "Server error",
      error: error.message,
    });
  } finally {
    session.endSession();
  }
});

export default route;
