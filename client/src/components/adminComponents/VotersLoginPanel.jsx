import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import QRCode from "qrcode";
import { Lock, QrCode, Unlock, X } from "lucide-react";
import { Button } from "../ui/button";
import { getAccessQr, getVotersSummary, setLoginWindow } from "../../service/adminApi";

const SUMMARY_POLL_MS = 10_000;
const RETRY_MS = 2_000;

// Full-screen rotating QR code for the projector. Each code is a signed link
// that works for its 20 s window (+ a short grace), then a new one appears.
const QrOverlay = ({ onClose }) => {
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
      // Next code exactly when this one rotates (in local time).
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

  // Rendered on <body> so the sidebar's scroll container cannot show through.
  // z-index must stay above .admin-page (z-index 9999 in AdminPage.css).
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
            alt="Voting QR code (changes every few seconds)"
            className="h-auto w-[min(70vh,90vw)] bg-white"
          />
          <div className="w-[min(70vh,90vw)]">
            <div className="h-2 w-full bg-white/10">
              <div
                className="h-2 bg-hackathon transition-[width] duration-200 ease-linear"
                style={{ width: `${fraction * 100}%` }}
              />
            </div>
            <p className="mt-3 text-center text-xl text-muted">
              New code in {secondsLeft}s · {window.location.host}
            </p>
          </div>
        </>
      )}

      {!qr && !error && <p className="text-xl text-muted">Loading...</p>}
      {error && <p className="text-lg text-danger">{error} Retrying...</p>}
    </div>,
    document.body
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

  return (
    <div className="space-y-3">
      {showQr && <QrOverlay onClose={() => setShowQr(false)} />}

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
        Closing stops new people joining. Voters already in can keep voting.
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
        Show it on the projector. The code changes every 20 seconds; an old photo of it stops
        working within about 30 seconds. Scanning again on the same phone keeps the same voter.
      </p>

      <div className="bg-white/5 px-3 py-2 text-sm">
        <div className="text-muted">Voters joined</div>
        <div className="text-2xl font-bold">{summary.voters}</div>
      </div>
    </div>
  );
};
