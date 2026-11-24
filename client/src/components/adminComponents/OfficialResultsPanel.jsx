import { useEffect, useState } from "react";
import { RefreshCw, Trophy } from "lucide-react";
import { Button } from "../ui/button";
import { getOfficialResults } from "../../service/adminApi";

const REFRESH_INTERVAL_MS = 10_000;

// 1er, 2e, 3e...
const ordinal = (n) => (n === 1 ? "1er" : `${n}e`);

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
    <section className="mb-8 rounded-xl border border-line-strong bg-panel p-6 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-xl font-bold text-ink">
            <Trophy className="h-5 w-5" />
            Résultats officiels
          </h3>
          <p className="text-sm text-muted">
            Classement par nombre de « oui » comptés (en cas d'égalité : moins de « non » d'abord).
            Seuls les votants qui ont voté pour toutes les équipes dont le vote a été ouvert sont comptés.
            Les votants qui ont manqué une équipe voient tous leurs votes écartés.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={load}
          disabled={loading}
          className="text-ink border-line-strong"
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Actualiser
        </Button>
      </div>

      {error && (
        <div role="alert" className="mb-4 rounded-lg border border-danger/40 bg-danger-ground px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      {results && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              ["Équipes comptées", `${results.countedTeams} / ${results.totalTeams}`],
              ["Votants complets (comptés)", results.completeVoters],
              ["Votants ayant voté au moins une fois", results.votersWithAnyVote],
              ["Votants écartés", results.discardedVoters],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg bg-panel-2 p-3">
                <div className="text-xs text-muted">{label}</div>
                <div className="text-2xl font-bold text-ink">{value}</div>
              </div>
            ))}
          </div>

          {!allTeamsCounted && results.totalTeams > 0 && (
            <p className="mb-3 text-sm text-warn">
              Not final yet: {results.totalTeams - results.countedTeams} team(s) have not opened voting.
            </p>
          )}

          {results.teams.length === 0 ? (
            <p className="text-sm text-muted">Aucune équipe n'a encore ouvert le vote.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b text-muted">
                  <tr>
                    <th className="py-2 pr-4">Rang</th>
                    <th className="py-2 pr-4">Équipe</th>
                    <th className="py-2 pr-4">Oui comptés</th>
                    <th className="py-2 pr-4">Non comptés</th>
                    <th className="py-2 pr-4">Oui / non bruts (tous les votes)</th>
                  </tr>
                </thead>
                <tbody>
                  {rankTeams(results.teams).map((team) => (
                    <tr key={team._id} className="border-b last:border-0 text-ink">
                      <td className="py-2 pr-4 font-bold whitespace-nowrap">
                        <span aria-hidden="true">{MEDALS[team.rank] || ""} </span>
                        {ordinal(team.rank)}
                        {team.tied && <span className="ml-1 text-xs font-normal text-muted">(égalité)</span>}
                      </td>
                      <td className="py-2 pr-4 font-medium">{team.teamName}</td>
                      <td className="py-2 pr-4 font-semibold text-ok">{team.official.yes}</td>
                      <td className="py-2 pr-4 font-semibold text-danger">{team.official.no}</td>
                      <td className="py-2 pr-4 text-muted">
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
