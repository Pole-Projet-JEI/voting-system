import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Maximize, RotateCcw, Trophy } from "lucide-react";
import { drawRaffle, getRaffle, resetRaffle } from "../../service/adminApi";
import { t } from "../../i18n";

const DASHBOARD_PATH = "/jvaFHT7xvivJPJqc1QBRWhfayoj/dashboard";
const SPIN_MS = 3200;

// Admin "tirage" page: each round the server draws one email among those that
// have not won yet. The page spins through the emails, then lands on the
// winner. Winners leave the game; their votes are not touched.
export default function RafflePage() {
  const [state, setState] = useState(null); // { totalEmails, remaining, pool, winners }
  const [display, setDisplay] = useState(""); // email shown in the big box
  const [current, setCurrent] = useState(null); // winner of the last draw
  const [spinning, setSpinning] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [error, setError] = useState("");
  const timer = useRef(0);

  useEffect(() => {
    (async () => {
      const result = await getRaffle();
      if (result.success) setState(result.data);
      else setError(t(result.error));
    })();
    return () => window.clearTimeout(timer.current);
  }, []);

  const spinTo = (pool, winner) =>
    new Promise((resolve) => {
      const start = performance.now();
      const step = () => {
        const elapsed = performance.now() - start;
        if (elapsed >= SPIN_MS || pool.length < 2) {
          setDisplay(winner);
          resolve();
          return;
        }
        setDisplay(pool[Math.floor(Math.random() * pool.length)]);
        // Starts fast (40 ms) and slows down (to ~330 ms) like a wheel.
        const progress = elapsed / SPIN_MS;
        timer.current = window.setTimeout(step, 40 + 290 * progress * progress);
      };
      step();
    });

  const draw = async () => {
    if (spinning || !state?.remaining) return;
    setError("");
    setSpinning(true);
    setCurrent(null);
    const poolBefore = state.pool;
    const result = await drawRaffle();
    if (!result.success) {
      setSpinning(false);
      setError(t(result.error));
      return;
    }
    await spinTo(poolBefore, result.data.winner.email);
    setCurrent(result.data.winner);
    setState(result.data);
    setSpinning(false);
  };

  const startOver = async () => {
    setConfirmReset(false);
    const result = await resetRaffle();
    if (!result.success) {
      setError(t(result.error));
      return;
    }
    setState(result.data);
    setCurrent(null);
    setDisplay("");
  };

  const fullScreen = () => document.documentElement.requestFullscreen?.().catch(() => {});

  const nextRound = (state?.winners.length || 0) + 1;
  const empty = state && state.remaining === 0;

  return (
    <div className="min-h-screen bg-ground px-4 py-6 text-ink sm:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link to={DASHBOARD_PATH} className="inline-flex items-center gap-2 text-sm text-muted hover:text-ink">
            <ArrowLeft className="h-4 w-4" />
            {t("Back to dashboard")}
          </Link>
          <button type="button" onClick={fullScreen} className="inline-flex items-center gap-2 text-sm text-muted hover:text-ink">
            <Maximize className="h-4 w-4" />
            {t("Full screen")}
          </button>
        </div>

        <div className="text-center">
          <h1 className="text-4xl font-bold sm:text-5xl">{t("Draw game")}</h1>
          {state && (
            <p className="mt-2 text-lg text-muted">
              {t("Round {n}", { n: current ? current.round : nextRound })} · {t("{n} in the game", { n: state.remaining })}
            </p>
          )}
        </div>

        {/* Big draw box */}
        <div
          className={`raffle-box flex min-h-[220px] flex-col items-center justify-center gap-3 border px-4 py-10 text-center ${
            current ? "border-green-400/60 bg-green-500/10" : "border-line-strong bg-white/5"
          }`}
          aria-live="polite"
        >
          {current && (
            <div className="flex items-center gap-2 text-lg font-semibold text-green-300">
              <Trophy className="h-6 w-6" />
              {t("Winner of round {n}", { n: current.round })}
            </div>
          )}
          <div
            className={`break-all font-bold tabular-nums ${
              current ? "text-4xl text-ink sm:text-6xl" : "text-3xl text-muted sm:text-5xl"
            }`}
            data-testid="raffle-display"
          >
            {display || "· · ·"}
          </div>
        </div>

        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={draw}
            disabled={!state || spinning || empty}
            className="w-full max-w-md bg-hackathon px-6 py-4 text-xl font-bold text-white hover:bg-hackathon-hover disabled:opacity-40"
          >
            {spinning ? t("Drawing...") : current ? t("Next round") : t("Draw a winner")}
          </button>
          {empty && <p className="text-sm text-muted">{t("No email left in the game.")}</p>}
          {error && <p className="text-sm text-danger">{error}</p>}
          <p className="text-xs text-faint">{t("Previous winners leave the game. Their votes still count.")}</p>
        </div>

        {/* Winners so far */}
        {state && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">{t("Winners")}</h2>
              {state.winners.length > 0 &&
                (confirmReset ? (
                  <span className="flex items-center gap-3 text-sm">
                    {t("Put every email back in the game?")}
                    <button type="button" onClick={startOver} className="font-semibold text-red-300 hover:underline">
                      {t("Yes, start over")}
                    </button>
                    <button type="button" onClick={() => setConfirmReset(false)} className="text-muted hover:underline">
                      {t("Cancel")}
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmReset(true)}
                    disabled={spinning}
                    className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink"
                  >
                    <RotateCcw className="h-4 w-4" />
                    {t("Start over")}
                  </button>
                ))}
            </div>
            {state.winners.length ? (
              <ol className="divide-y divide-white/5 bg-white/5">
                {[...state.winners].reverse().map((w) => (
                  <li key={w.round} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <span className="text-muted">{t("Round {n}", { n: w.round })}</span>
                    <span className="break-all font-medium">{w.email}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-muted">{t("No winner yet.")}</p>
            )}
            <p className="text-xs text-faint">
              {t("Emails in the game")}: {state.remaining} / {state.totalEmails}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
