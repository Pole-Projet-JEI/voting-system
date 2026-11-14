import Team from "../../mongodb/teamSchema.mjs";

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

export async function updateTeam(teamId, updates) {
  const updatedTeam = await Team.findByIdAndUpdate(
    teamId,
    { $set: updates },
    { new: true, runValidators: true }
  );

  return updatedTeam;
}

export async function deleteTeam(teamId) {
  const deletedTeam = await Team.findOneAndDelete({
    _id: teamId,
    presenting: false,
    presented: false,
  });

  if (deletedTeam) {
    return deletedTeam;
  }

  const team = await Team.findById(teamId).select("presenting presented");

  if (!team) {
    return null;
  }

  if (team.presenting) {
    throw new Error("Cannot delete team that is currently presenting");
  }

  if (team.presented) {
    throw new Error("Cannot delete team that has already presented");
  }

  return null;
}
