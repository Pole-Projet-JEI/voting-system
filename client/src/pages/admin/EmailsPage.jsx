import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Download, Search } from "lucide-react";
import { getVoters } from "../../service/adminApi";
import { LANG, t } from "../../i18n";

const POLL_MS = 10_000;
export const EMAILS_PATH = "/jvaFHT7xvivJPJqc1QBRWhfayoj/emails";
const DASHBOARD_PATH = "/jvaFHT7xvivJPJqc1QBRWhfayoj/dashboard";

const formatTime = (value) =>
  value
    ? new Date(value).toLocaleString(LANG === "fr" ? "fr-FR" : "en-GB", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : "";

const csvCell = (value) => {
  const text = String(value ?? "");
  // Quote every cell; neutralise spreadsheet formulas (=, +, -, @).
  return `"${(/^[=+\-@]/.test(text) ? `'${text}` : text).replace(/"/g, '""')}"`;
};

// Admin page: every email typed on the voting site, with how many teams each
// one voted for. Only voters who voted for every team count in the results.
export default function EmailsPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let active = true;
    const load = async () => {
      const result = await getVoters();
      if (!active) return;
      if (result.success) {
        setData(result.data);
        setError("");
      } else {
        setError(t(result.error));
      }
    };
    load();
    const timer = window.setInterval(load, POLL_MS);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const voters = useMemo(() => (data?.voters || []).filter((v) => v.email), [data]);
  const isComplete = (v) => data.totalTeams > 0 && v.teamsVoted >= data.totalTeams;
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? voters.filter((v) => v.email.includes(q)) : voters;
  }, [voters, query]);

  const downloadCsv = () => {
    const header = ["email", "teams_voted", "total_teams", "counted", "yes", "no", "joined_at"];
    const rows = voters.map((v) => [
      v.email,
      v.teamsVoted,
      data.totalTeams,
      isComplete(v) ? "yes" : "no",
      v.yes,
      v.no,
      v.joinedAt ? new Date(v.joinedAt).toISOString() : "",
    ]);
    const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `emails-votants-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const complete = data ? voters.filter(isComplete).length : 0;

  return (
    <div className="min-h-screen bg-ground px-4 py-6 text-ink sm:px-8">
      <div className="mx-auto max-w-4xl space-y-5">
        <Link to={DASHBOARD_PATH} className="inline-flex items-center gap-2 text-sm text-muted hover:text-ink">
          <ArrowLeft className="h-4 w-4" />
          {t("Back to dashboard")}
        </Link>

        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold">{t("Voter emails")}</h1>
            <p className="mt-1 text-xs text-faint">{t("Updated every 10 seconds.")}</p>
          </div>
          <button
            type="button"
            onClick={downloadCsv}
            disabled={!voters.length}
            className="inline-flex items-center gap-2 border border-line-strong px-4 py-2 text-sm font-semibold hover:bg-white/10 disabled:opacity-40"
          >
            <Download className="h-4 w-4" />
            {t("Download CSV")}
          </button>
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        {data && (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                [t("Emails typed"), voters.length, "text-ink"],
                [t("Voted for every team (counted)"), complete, "text-green-300"],
                [t("Missing at least one team (not counted)"), voters.length - complete, "text-red-300"],
              ].map(([label, value, color]) => (
                <div key={label} className="bg-white/5 px-4 py-3">
                  <div className="text-xs text-muted">{label}</div>
                  <div className={`text-3xl font-bold tabular-nums ${color}`}>{value}</div>
                </div>
              ))}
            </div>

            <label className="flex items-center gap-2 border border-line-strong bg-white/5 px-3">
              <Search className="h-4 w-4 text-muted" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("Search an email")}
                className="w-full bg-transparent py-2 text-sm outline-none placeholder:text-faint"
              />
            </label>

            <div className="overflow-x-auto bg-white/5">
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-muted">
                  <tr>
                    <th className="px-3 py-2 font-medium">#</th>
                    <th className="px-3 py-2 font-medium">{t("Email")}</th>
                    <th className="px-3 py-2 text-right font-medium">{t("Teams voted")}</th>
                    <th className="px-3 py-2 font-medium"></th>
                    <th className="px-3 py-2 font-medium">{t("Joined at")}</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((v) => (
                    <tr key={v.id} className="border-t border-white/5">
                      <td className="px-3 py-2 tabular-nums text-faint">{voters.indexOf(v) + 1}</td>
                      <td className="break-all px-3 py-2">{v.email}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {v.teamsVoted}/{data.totalTeams}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`px-2 py-0.5 text-xs font-semibold ${
                            isComplete(v) ? "bg-green-500/20 text-green-300" : "bg-red-500/20 text-red-300"
                          }`}
                        >
                          {isComplete(v) ? t("Counted") : t("Not counted")}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 tabular-nums text-muted">{formatTime(v.joinedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!shown.length && (
                <p className="px-3 py-6 text-center text-sm text-muted">
                  {voters.length ? t("No email matches.") : t("No email yet.")}
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
