import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import QRCode from "qrcode";
import { Lock, QrCode, Unlock, X } from "lucide-react";
import { Button } from "../ui/button";
import { getVotersSummary, setLoginWindow } from "../../service/adminApi";

const SUMMARY_POLL_MS = 10_000;

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
        Opening the link gives each phone its own voter session (cookie). Votes are only
        accepted from inside the venue, and only voters who voted for every team are counted.
      </p>

      <div className="bg-white/5 px-3 py-2 text-sm">
        <div className="text-muted">Voters joined</div>
        <div className="text-2xl font-bold">{summary.voters}</div>
      </div>
    </div>
  );
};
