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

    if (currentPresentingTeam) {
      await Team.updateOne(
        { _id: currentPresentingTeam._id },
        {
          $set: {
            presenting: false,
            presented: true,
            presentedAt: new Date(),
          },
        },
        { session }
      );
    }

    const newPresentingTeam = await Team.findOneAndUpdate(
      { _id: newTeamId },
      {
        $set: {
          presenting: true,
        },
      },
      { session, new: true }
    );

    await session.commitTransaction();
    return newPresentingTeam;
  } catch (error) {
    await session.abortTransaction();
    console.error(error);
    return { error: error.message || "Failed to set presenting team" };
  } finally {
    session.endSession();
  }
}

export async function getCurrentPresentingTeam() {
  return await Team.findOne({ presenting: true });
}

export async function stopPresenting() {
  const currentPresentingTeam = await Team.findOne({ presenting: true });

  if (!currentPresentingTeam) {
    return null;
  }

  await Team.updateOne(
    { _id: currentPresentingTeam._id },
    {
      $set: {
        presenting: false,
        presented: true,
        presentedAt: new Date(),
      },
    }
  );

  return currentPresentingTeam;
}
