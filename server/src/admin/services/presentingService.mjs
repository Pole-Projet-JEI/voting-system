import Team from "../../mongodb/teamSchema.mjs";
import mongoose from "mongoose";

/**
 * Change the presenting team
 * - Sets current presenting team to presented: true, presenting: false
 * - Sets new team to presenting: true
 * @param {string} newTeamId - The ID of the new team to present
 * @returns {Promise<Object>} - The new presenting team
 */
export async function changePresentingTeam(newTeamId) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Check if the team to be presented already has presented
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
    throw error;
  } finally {
    session.endSession();
  }
}

/**
 * Get the current presenting team
 * @returns {Promise<Object|null>} - The presenting team or null
 */
export async function getCurrentPresentingTeam() {
  return await Team.findOne({ presenting: true });
}

/**
 * Stop presenting (no team presenting)
 * - Sets current presenting team to presented: true, presenting: false
 * @returns {Promise<Object|null>} - The team that was presenting
 */
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
