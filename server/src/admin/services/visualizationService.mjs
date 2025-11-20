import Team from "../../mongodb/teamSchema.mjs";

/**
 * Get all teams with their vote counts
 * @returns {Promise<Array>} - Array of teams
 */
export async function getAllTeams() {
  return await Team.find().sort({ nyes: -1 });
}