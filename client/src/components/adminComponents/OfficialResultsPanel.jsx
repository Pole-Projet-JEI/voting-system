import { useEffect, useState } from "react";
import { RefreshCw, Trophy } from "lucide-react";
import { Button } from "../ui/button";
import { getOfficialResults } from "../../service/adminApi";

const REFRESH_INTERVAL_MS = 10_000;

const ordinal = (n) => {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  return `${n}${{ 1: "st", 2: "nd", 3: "rd" }[n % 10] || "th"}`;
};

// Ranking: most counted "yes" first; on a tie, fewer counted "no" ranks
// higher; teams still equal share the same place (1st, 1st, 3rd...).
export const rankTeams = (teams) => {
  const sorted = [...teams].sort(
    (a, b) =>
      b.official.yes - a.official.yes ||
      a.official.no - b.official.no ||
      a.teamName.localeCompare(b.teamName)
  );
  return sorted.map((team, index) => {
    let rank = index + 1;
    for (let k = index - 1; k >= 0; k--) {
      const prev = sorted[k];
      if (prev.official.yes === team.official.yes && prev.official.no === team.official.no) {
        rank = k + 1;
      } else {
        break;
      }
    }
    const tied = sorted.some(
      (other) =>
        other !== team &&
        other.official.yes === team.official.yes &&
        other.official.no === team.official.no
    );
    return { ...team, rank, tied };
  });
};

const MEDALS = { 1: "🥇", 2: "🥈", 3: "🥉" };

export const OfficialResultsPanel = () => {
  const [results, setResults] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    const result = await getOfficialResults();
    setLoading(false);
    if (result.success) {
      setResults(result.data);
      setError("");
    } else {
      setError(result.error);
    }
  };

  useEffect(() => {
    load();
    const timer = setInterval(load, REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  const allTeamsCounted =
    results && results.totalTeams > 0 && results.countedTeams === results.totalTeams;

  return (
    <section className="mb-8 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-xl font-bold text-gray-900">
            <Trophy className="h-5 w-5" />
            Official results
          </h3>
          <p className="text-sm text-gray-500">
            Ranked by counted yes votes (ties: fewer no votes first). Only voters who voted
            for every team that has opened voting are counted.
            Voters who missed a team have all their votes discarded.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={load}
          disabled={loading}
          className="text-gray-900 border-gray-300"
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {error && (
        <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {results && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              ["Teams counted", `${results.countedTeams} / ${results.totalTeams}`],
              ["Complete voters (counted)", results.completeVoters],
              ["Voters with any vote", results.votersWithAnyVote],
              ["Discarded voters", results.discardedVoters],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg bg-gray-50 p-3">
                <div className="text-xs text-gray-500">{label}</div>
                <div className="text-2xl font-bold text-gray-900">{value}</div>
              </div>
            ))}
          </div>

          {!allTeamsCounted && results.totalTeams > 0 && (
            <p className="mb-3 text-sm text-amber-700">
              Not final yet: {results.totalTeams - results.countedTeams} team(s) have not opened voting.
            </p>
          )}

          {results.teams.length === 0 ? (
            <p className="text-sm text-gray-500">No team has opened voting yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b text-gray-500">
                  <tr>
                    <th className="py-2 pr-4">Rank</th>
                    <th className="py-2 pr-4">Team</th>
                    <th className="py-2 pr-4">Counted yes</th>
                    <th className="py-2 pr-4">Counted no</th>
                    <th className="py-2 pr-4">Raw yes / no (all votes)</th>
                  </tr>
                </thead>
                <tbody>
                  {rankTeams(results.teams).map((team) => (
                    <tr key={team._id} className="border-b last:border-0 text-gray-900">
                      <td className="py-2 pr-4 font-bold whitespace-nowrap">
                        <span aria-hidden="true">{MEDALS[team.rank] || ""} </span>
                        {ordinal(team.rank)}
                        {team.tied && <span className="ml-1 text-xs font-normal text-gray-500">(tie)</span>}
                      </td>
                      <td className="py-2 pr-4 font-medium">{team.teamName}</td>
                      <td className="py-2 pr-4 font-semibold text-green-700">{team.official.yes}</td>
                      <td className="py-2 pr-4 font-semibold text-red-700">{team.official.no}</td>
                      <td className="py-2 pr-4 text-gray-500">
                        {team.raw.yes} / {team.raw.no}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
};
