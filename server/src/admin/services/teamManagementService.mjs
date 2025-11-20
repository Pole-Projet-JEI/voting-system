import Team from "../../mongodb/teamSchema.mjs";

/**
 * Create a new team
 * @param {string} teamName - The name of the team
 * @param {string} description - The team description
 * @returns {Promise<Object>} - The created team
 */
export async function createTeam(teamName, description = "") {
  const newTeam = await Team.create({
    teamName,
    description,
    nyes: 0,
    nno: 0,
    presented: false,
    presenting: false,
  });

  return newTeam;
}

/**
 * Update a team
 * @param {string} teamId - The ID of the team to update
 * @param {Object} updates - Object with fields to update
 * @returns {Promise<Object|null>} - The updated team or null if not found
 */
export async function updateTeam(teamId, updates) {
  const updatedTeam = await Team.findByIdAndUpdate(
    teamId,
    { $set: updates },
    { new: true, runValidators: true }
  );

  return updatedTeam;
}

/**
 * Delete a team
 * @param {string} teamId - The ID of the team to delete
 * @returns {Promise<Object|null>} - The deleted team or null if not found
 */
export async function deleteTeam(teamId) {
  const team = await Team.findById(teamId);

  if (!team) {
    return null;
  }

  // Prevent deletion of currently presenting team
  if (team.presenting) {
    throw new Error("Cannot delete team that is currently presenting");
  }

  // Prevent deletion of teams that have presented (optional - you can remove this if you want to allow it)
  if (team.presented) {
    throw new Error("Cannot delete team that has already presented");
  }

  const deletedTeam = await Team.findByIdAndDelete(teamId);
  return deletedTeam;
}
