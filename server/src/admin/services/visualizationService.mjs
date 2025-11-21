import Team from "../../mongodb/teamSchema.mjs";

export async function getAllTeams() {
  return await Team.find().sort({ nyes: -1 });
}
