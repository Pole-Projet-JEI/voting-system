import Team from "../../mongodb/teamSchema.mjs";
import Voter from "../../mongodb/voterSchema.mjs";

// A team "counts" once its voting has opened (voting now, or ended).
export const OPENED_TEAM_FILTER = {
  $or: [{ state: { $in: ["voting", "ended"] } }, { presented: true }],
};

// Pure tally: only voters who voted for EVERY counted team are included.
// Voters who skipped any counted team have all their votes discarded.
export const tallyOfficialResults = (teams, voters) => {
  const teamIds = teams.map((team) => String(team._id));
  const official = new Map(teamIds.map((id) => [id, { yes: 0, no: 0 }]));
  let completeVoters = 0;
  let votersWithAnyVote = 0;

  for (const voter of voters) {
    const votes = voter.votes instanceof Map
      ? voter.votes
      : new Map(Object.entries(voter.votes || {}));

    if (teamIds.some((id) => votes.has(id))) {
      votersWithAnyVote += 1;
    }

    if (teamIds.length === 0 || !teamIds.every((id) => votes.has(id))) {
      continue;
    }

    completeVoters += 1;
    for (const id of teamIds) {
      const choice = votes.get(id)?.vote;
      if (choice === "yes" || choice === "no") {
        official.get(id)[choice] += 1;
      }
    }
  }

  return {
    countedTeams: teamIds.length,
    completeVoters,
    votersWithAnyVote,
    discardedVoters: votersWithAnyVote - completeVoters,
    teams: teams.map((team) => {
      const id = String(team._id);
      return {
        _id: id,
        teamName: team.teamName,
        state: team.state,
        raw: { yes: team.nyes || 0, no: team.nno || 0 },
        official: official.get(id),
      };
    }),
  };
};

export async function getOfficialResults() {
  const [countedTeams, totalTeams] = await Promise.all([
    Team.find(OPENED_TEAM_FILTER, { teamName: 1, state: 1, nyes: 1, nno: 1 })
      .sort({ presentedAt: 1, createdAt: 1 })
      .lean(),
    Team.countDocuments(),
  ]);

  if (countedTeams.length === 0) {
    return { ...tallyOfficialResults([], []), totalTeams };
  }

  const teamIds = countedTeams.map((team) => String(team._id));
  const voters = await Voter.find(
    { $or: teamIds.map((id) => ({ [`votes.${id}`]: { $exists: true } })) },
    { votes: 1 }
  ).lean();

  return { ...tallyOfficialResults(countedTeams, voters), totalTeams };
}

// Voter-facing progress: how many of the event's teams this voter has voted for.
export async function getVoterProgress(voter) {
  const teams = await Team.find({}, { _id: 1 }).lean();
  const votes = voter?.votes instanceof Map
    ? voter.votes
    : new Map(Object.entries(voter?.votes || {}));
  const votedTeams = teams.filter((team) => votes.has(String(team._id))).length;
  return { votedTeams, totalTeams: teams.length };
}
