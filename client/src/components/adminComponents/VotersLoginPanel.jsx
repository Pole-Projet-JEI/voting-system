import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import QRCode from "qrcode";
import { Lock, QrCode, Unlock, X } from "lucide-react";
import { Button } from "../ui/button";
import { getAccessQr, getVoters, getVotersSummary, setLoginWindow } from "../../service/adminApi";

const SUMMARY_POLL_MS = 10_000;
const RETRY_MS = 2_000;

const votingLink = () => `${window.location.origin}/register`;

// Full-screen QR code of the plain voting link, for the projector.
const QrOverlay = ({ onClose }) => {
  const [dataUrl, setDataUrl] = useState("");

  useEffect(() => {
    QRCode.toDataURL(votingLink(), { errorCorrectionLevel: "M", margin: 2, width: 1024 }).then(setDataUrl);
  }, []);

  // Rendered on <body> so the sidebar's scroll container cannot show through.
  // z-index must stay above .admin-page (z-index 9999 in AdminPage.css).
  return createPortal(
    <div className="fixed inset-0 z-[10000] flex flex-col items-center justify-center gap-6 bg-ground p-6">
      <button
        type="button"
        onClick={onClose}
        className="absolute right-6 top-6 p-2 text-muted hover:bg-white/5"
        aria-label="Close QR code"
      >
        <X className="h-8 w-8" />
      </button>
      <h2 className="text-center text-4xl font-bold text-ink">Scan to vote</h2>
      {dataUrl && (
        <img src={dataUrl} alt={`QR code for ${votingLink()}`} className="h-auto w-[min(72vh,90vw)] bg-white" />
      )}
      <p className="text-center text-3xl font-semibold text-ink">{window.location.host}</p>
    </div>,
    document.body
  );
};

// qr-email mode: full-screen QR code that changes every 25 s. Each code is a
// signed link that works for its window (+ a short grace), then a new one
// appears. The server's clock decides when it rotates.
const RotatingQrOverlay = ({ onClose }) => {
  const [qr, setQr] = useState(null); // { open, url, dataUrl, expiresAt, periodSeconds }
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());
  const skewRef = useRef(0); // server time - local time

  useEffect(() => {
    let active = true;
    let timer = 0;

    const load = async () => {
      const result = await getAccessQr();
      if (!active) return;
      if (!result.success) {
        setError(result.error);
        timer = window.setTimeout(load, RETRY_MS);
        return;
      }
      setError("");
      const data = result.data;
      if (!data.open) {
        setQr({ open: false });
        timer = window.setTimeout(load, RETRY_MS);
        return;
      }
      skewRef.current = data.serverTime - Date.now();
      const url = `${window.location.origin}${data.path}`;
      const dataUrl = await QRCode.toDataURL(url, { errorCorrectionLevel: "M", margin: 2, width: 1024 });
      if (!active) return;
      setQr({ open: true, url, dataUrl, expiresAt: data.expiresAt, periodSeconds: data.periodSeconds });
      const wait = data.expiresAt - (Date.now() + skewRef.current) + 150;
      timer = window.setTimeout(load, Math.max(500, wait));
    };

    load();
    const tick = window.setInterval(() => setNow(Date.now()), 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
      window.clearInterval(tick);
    };
  }, []);

  const secondsLeft = qr?.open
    ? Math.max(0, Math.ceil((qr.expiresAt - (now + skewRef.current)) / 1000))
    : 0;
  const fraction = qr?.open ? Math.min(1, secondsLeft / qr.periodSeconds) : 0;

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex flex-col items-center justify-center gap-5 bg-ground p-6">
      <button
        type="button"
        onClick={onClose}
        className="absolute right-6 top-6 p-2 text-muted hover:bg-white/5"
        aria-label="Close QR code"
      >
        <X className="h-8 w-8" />
      </button>
      <h2 className="text-center text-4xl font-bold text-ink">Scan to vote</h2>

      {qr?.open === false && (
        <p className="max-w-xl text-center text-2xl text-muted">
          Login is closed. Open login in the dashboard to show the QR code.
        </p>
      )}

      {qr?.open && (
        <>
          <img
            key={qr.url}
            src={qr.dataUrl}
            alt="Voting QR code (changes every 25 seconds)"
            className="h-auto w-[min(70vh,90vw)] bg-white"
          />
          <div className="w-[min(70vh,90vw)]">
            <div className="h-2 w-full bg-white/10">
              <div
                className="h-2 bg-hackathon transition-[width] duration-200 ease-linear"
                style={{ width: `${fraction * 100}%` }}
              />
            </div>
            <p className="mt-3 text-center text-xl text-muted">New code in {secondsLeft}s</p>
          </div>
        </>
      )}

      {!qr && !error && <p className="text-xl text-muted">Loading...</p>}
      {error && <p className="text-lg text-danger">{error} Retrying...</p>}
    </div>,
    document.body
  );
};

// qr-email mode: each email and how many teams it voted for.
const VotersTable = () => {
  const [data, setData] = useState(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const result = await getVoters();
      if (active && result.success) setData(result.data);
    };
    load();
    const timer = window.setInterval(load, SUMMARY_POLL_MS);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  if (!data) return null;
  const complete = data.voters.filter((v) => data.totalTeams > 0 && v.teamsVoted >= data.totalTeams).length;

  return (
    <div className="space-y-2">
      <div className="text-xs text-faint">
        {complete} of {data.voters.length} voted for all {data.totalTeams} teams
      </div>
      <div className="max-h-80 overflow-y-auto bg-white/5">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-ground text-muted">
            <tr>
              <th className="px-2 py-1 font-medium">Email</th>
              <th className="px-2 py-1 text-right font-medium">Teams</th>
            </tr>
          </thead>
          <tbody>
            {data.voters.map((voter) => (
              <tr key={voter.id} className="border-t border-white/5">
                <td className="max-w-[11rem] truncate px-2 py-1" title={voter.email || ""}>
                  {voter.email || "(no email)"}
                </td>
                <td
                  className={`px-2 py-1 text-right tabular-nums ${
                    data.totalTeams > 0 && voter.teamsVoted >= data.totalTeams ? "text-green-300" : "text-muted"
                  }`}
                >
                  {voter.teamsVoted}/{data.totalTeams}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export const VotersLoginPanel = ({ onNotify }) => {
  const [summary, setSummary] = useState(null);
  const [busy, setBusy] = useState(false);
  const [showQr, setShowQr] = useState(false);

  const refresh = async () => {
    const result = await getVotersSummary();
    if (result.success) {
      setSummary(result.data);
    } else {
      onNotify?.("error", result.error);
    }
  };

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, SUMMARY_POLL_MS);
    return () => window.clearInterval(timer);
  }, []);

  const toggleLogin = async () => {
    setBusy(true);
    const result = await setLoginWindow(!summary?.loginOpen);
    setBusy(false);
    if (!result.success) {
      onNotify?.("error", result.error);
      return;
    }
    onNotify?.("success", result.data.message);
    refresh();
  };

  if (!summary) {
    return <p className="text-sm text-muted">Loading voters...</p>;
  }

  const qrEmail = summary.mode === "qr-email";

  return (
    <div className="space-y-3">
      {showQr &&
        (qrEmail ? (
          <RotatingQrOverlay onClose={() => setShowQr(false)} />
        ) : (
          <QrOverlay onClose={() => setShowQr(false)} />
        ))}

      <div className="flex items-center justify-between">
        <span className="text-sm text-muted">Login</span>
        <span
          className={`px-2 py-0.5 text-xs font-semibold ${
            summary.loginOpen ? "bg-green-500/20 text-green-300" : "bg-red-500/20 text-red-300"
          }`}
        >
          {summary.loginOpen ? "Open" : "Closed"}
        </span>
      </div>
      <Button
        type="button"
        onClick={toggleLogin}
        disabled={busy}
        className={
          summary.loginOpen
            ? "w-full bg-jobfair text-white hover:bg-jobfair-hover"
            : "w-full bg-hackathon text-white hover:bg-hackathon-hover"
        }
      >
        {summary.loginOpen ? (
          <><Lock className="mr-2 h-4 w-4" />Close login</>
        ) : (
          <><Unlock className="mr-2 h-4 w-4" />Open login</>
        )}
      </Button>
      <p className="text-xs text-faint">
        Closed: phones opening the link wait. Voters already in can keep voting.
      </p>

      <Button
        type="button"
        variant="outline"
        onClick={() => setShowQr(true)}
        className="w-full border-line-strong text-white hover:bg-white/10"
      >
        <QrCode className="mr-2 h-4 w-4" />
        Show QR code
      </Button>
      <p className="text-xs text-faint">
        {qrEmail
          ? "The QR code changes every 25 s. Voters scan it, then type their email (one voter per email). Only voters who voted for every team are counted."
          : "Opening the link gives each phone its own voter session (cookie). Votes are only accepted from inside the venue, and only voters who voted for every team are counted."}
      </p>

      <div className="bg-white/5 px-3 py-2 text-sm">
        <div className="text-muted">Voters joined</div>
        <div className="text-2xl font-bold">{summary.voters}</div>
      </div>
      {qrEmail && <VotersTable />}
    </div>
  );
};
