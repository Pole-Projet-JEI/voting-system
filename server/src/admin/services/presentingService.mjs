import Team from "../../mongodb/teamSchema.mjs";
import mongoose from "mongoose";

export async function changePresentingTeam(newTeamId) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const teamToPresent = await Team.findById(newTeamId).session(session);

    if (!teamToPresent) {
      throw new Error("Team not found");
    }

    if (teamToPresent.presented) {
      throw new Error("Team has already presented");
    }

    const currentPresentingTeam = await Team.findOne({
      presenting: true,
    }).session(session);

    if (
      currentPresentingTeam &&
      currentPresentingTeam._id.toString() !== teamToPresent._id.toString()
    ) {
      throw new Error("Another team is currently presenting");
    }

    if (currentPresentingTeam) {
      await session.commitTransaction();
      return currentPresentingTeam;
    }

    const newPresentingTeam = await Team.findOneAndUpdate(
      { _id: newTeamId },
      {
        $set: {
          presenting: true,
          state: "presenting",
        },
      },
      { session, new: true }
    );

    await session.commitTransaction();
    return newPresentingTeam;
  } catch (error) {
    await session.abortTransaction();
    console.error(
      "Admin presenting transaction failed:",
      JSON.stringify({
        name: error?.name || "Error",
        message: error?.message || "Unknown transaction error",
      })
    );
    return { error: error.message || "Failed to set presenting team" };
  } finally {
    session.endSession();
  }
}

export async function getCurrentPresentingTeam() {
  return await Team.findOne({
    $or: [{ state: { $in: ["presenting", "voting"] } }, { presenting: true }],
  });
}

export async function startVoting() {
  return await Team.findOneAndUpdate(
    {
      $or: [{ state: "presenting" }, { presenting: true, presented: false }],
    },
    { $set: { state: "voting", presenting: true } },
    { new: true }
  );
}

export async function stopPresenting() {
  return await Team.findOneAndUpdate(
    { $or: [{ state: { $in: ["presenting", "voting"] } }, { presenting: true }] },
    {
      $set: {
        presenting: false,
        presented: true,
        state: "ended",
        presentedAt: new Date(),
      },
    },
    { new: false }
  );
}
