import { Router } from "express";
import Team from "../mongodb/teamSchema.mjs";
import Voter from "../mongodb/voterSchema.mjs";
import { requireAuth } from "../middleware/auth-cookie.mjs";
import mongoose from "mongoose";
import { requireVenuePresence } from "../geofence/require-venue-presence.mjs";

const route = Router();

const VOTING_TEAM_FILTER = [
  { state: "voting" },
  { state: { $exists: false }, presenting: true },
];

// No multi-document transaction: hundreds of simultaneous votes on the same
// team document made transactions fail with WriteConflict and retry for up to
// 120 s. Instead:
//   1. the voter document is the source of truth; one atomic conditional
//      update stores the ballot only if this voter has no vote for the team
//      (so double votes are impossible);
//   2. the team counter is then incremented atomically. It is a display
//      counter; official results are always computed from voter documents.
route.post("/api/vote/:id", requireAuth, requireVenuePresence, async (req, res) => {
  const teamId = req.params.id;
  const { vote } = req.body;
  const voterId = req.voter?._id;

  if (!["yes", "no"].includes(vote)) {
    return res.status(400).json({
      voted: false,
      message: "Le vote doit être « oui » ou « non »",
    });
  }

  if (!mongoose.isValidObjectId(teamId)) {
    return res.status(400).json({
      voted: false,
      message: "Équipe invalide",
    });
  }

  try {
    const votingTeam = await Team.findOne(
      { _id: teamId, $or: VOTING_TEAM_FILTER },
      { _id: 1 }
    ).lean();

    if (!votingTeam) {
      return res.status(400).json({
        voted: false,
        message: "Cette équipe ne présente pas en ce moment",
      });
    }

    const voter = await Voter.findOneAndUpdate(
      { _id: voterId, [`votes.${teamId}`]: { $exists: false } },
      {
        $set: {
          [`votes.${teamId}`]: {
            vote,
            votedAt: new Date(),
            ...(req.venueCheck?.distanceMeters !== undefined && {
              distanceMeters: req.venueCheck.distanceMeters,
              accuracyMeters: req.venueCheck.accuracyMeters,
            }),
          },
        },
      },
      { new: true, projection: { _id: 1 } }
    );

    if (!voter) {
      const existingVoter = await Voter.findById(voterId);
      if (existingVoter?.votes?.has(teamId)) {
        return res.status(400).json({
          voted: false,
          message: "Vous avez déjà voté pour cette équipe",
          existingVote: existingVoter.votes.get(teamId).vote,
        });
      }
      return res.status(404).json({ voted: false, message: "Votant introuvable" });
    }

    try {
      await Team.updateOne(
        { _id: teamId },
        { $inc: { [vote === "yes" ? "nyes" : "nno"]: 1 } }
      );
    } catch (counterError) {
      // The ballot is stored; only the live counter is behind.
      console.error(
        JSON.stringify({
          event: "vote_counter_update_failed",
          requestId: req.requestId,
          teamId,
          message: counterError.message,
        })
      );
    }

    return res.status(200).json({
      voted: true,
      message: "Vote enregistré",
      vote,
    });
  } catch (error) {
    console.error("Error recording vote:", error.message);
    return res.status(500).json({
      voted: false,
      message: "Erreur du serveur",
    });
  }
});

export default route;
