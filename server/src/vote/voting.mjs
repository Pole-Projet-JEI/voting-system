import { Router } from "express";
import Team from "../mongodb/teamSchema.mjs";
import Voter from "../mongodb/voterSchema.mjs";
import { requireAuth } from "../middleware/auth-cookie.mjs";
import mongoose from "mongoose";

const route = Router();

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
  let transactionStarted = false;

  try {
    session = await mongoose.startSession();
    session.startTransaction();
    transactionStarted = true;

    const presentingTeam = await Team.findOne(
      { _id: teamId, presenting: true },
      { _id: 1 },
      { session }
    ).lean();

    if (!presentingTeam) {
      await session.abortTransaction();
      transactionStarted = false;
      return res.status(400).json({
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
      await session.abortTransaction();
      transactionStarted = false;

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

    const teamUpdate = await Team.updateOne(
      { _id: teamId, presenting: true },
      { $inc: { [vote === "yes" ? "nyes" : "nno"]: 1 } },
      { session }
    );

    if (teamUpdate.matchedCount !== 1) {
      throw new Error("The presenting team is no longer available");
    }

    await session.commitTransaction();
    transactionStarted = false;

    return res.status(200).json({
      voted: true,
      message: "Vote recorded successfully",
      vote: vote,
    });
  } catch (error) {
    if (session && transactionStarted) {
      try {
        await session.abortTransaction();
      } catch (abortError) {
        console.error("Error rolling back vote transaction:", abortError);
      }
    }

    console.error("Error recording vote:", error);
    return res.status(500).json({
      voted: false,
      message: "Server error",
      error: error.message,
    });
  } finally {
    if (session) {
      await session.endSession();
    }
  }
});

export default route;
