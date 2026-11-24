import { t } from "../../i18n";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import QRCode from "qrcode";
import { ExternalLink, Lock, QrCode, Unlock, X } from "lucide-react";
import { Button } from "../ui/button";
import { Link } from "react-router-dom";
import { getAccessQr, getVoters, getVotersSummary, setLoginWindow } from "../../service/adminApi";

export const QR_SCREEN_PATH = "/jvaFHT7xvivJPJqc1QBRWhfayoj/qr";
const SUMMARY_POLL_MS = 10_000;
const RETRY_MS = 2_000;

const votingLink = () => `${window.location.origin}/register`;

// Full-screen QR code of the plain voting link, for the projector.
export const QrOverlay = ({ onClose }) => {
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
        aria-label="Fermer le QR code"
      >
        <X className="h-8 w-8" />
      </button>
      <h2 className="text-center text-4xl font-bold text-ink">{t("Scan to vote")}</h2>
      {dataUrl && (
        <img src={dataUrl} alt={`QR code pour ${votingLink()}`} className="h-auto w-[min(72vh,90vw)] bg-white" />
      )}
      <p className="text-center text-3xl font-semibold text-ink">{window.location.host}</p>
    </div>,
    document.body
  );
};

// qr-email mode: full-screen QR code that changes every 15 s. Each code is a
// signed link that works for its window (+ a short grace), then a new one
// appears. The server's clock decides when it rotates.
export const RotatingQrOverlay = ({ onClose }) => {
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
        aria-label="Fermer le QR code"
      >
        <X className="h-8 w-8" />
      </button>
      <h2 className="text-center text-4xl font-bold text-ink">{t("Scan to vote")}</h2>

      {qr?.open === false && (
        <p className="max-w-xl text-center text-2xl text-muted">
          {t("Login is closed. Open login in the dashboard to show the QR code.")}
        </p>
      )}

      {qr?.open && (
        <>
          <img
            key={qr.url}
            src={qr.dataUrl}
            alt="QR code de vote (change toutes les 15 secondes)"
            className="h-auto w-[min(70vh,90vw)] bg-white"
          />
          <div className="w-[min(70vh,90vw)]">
            <div className="h-2 w-full bg-white/10">
              <div
                className="h-2 bg-hackathon transition-[width] duration-200 ease-linear"
                style={{ width: `${fraction * 100}%` }}
              />
            </div>
          </div>
        </>
      )}

      {!qr && !error && <p className="text-xl text-muted">{t("Loading...")}</p>}
      {error && <p className="text-lg text-danger">{t(error)} {t("Retrying...")}</p>}
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
        {complete} sur {data.voters.length} ont voté pour les {data.totalTeams} équipes
      </div>
      <div className="max-h-80 overflow-y-auto bg-white/5">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-ground text-muted">
            <tr>
              <th className="px-2 py-1 font-medium">E-mail</th>
              <th className="px-2 py-1 text-right font-medium">Équipes</th>
            </tr>
          </thead>
          <tbody>
            {data.voters.map((voter) => (
              <tr key={voter.id} className="border-t border-white/5">
                <td className="max-w-[11rem] truncate px-2 py-1" title={voter.email || ""}>
                  {voter.email || "(sans e-mail)"}
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
    return <p className="text-sm text-muted">Chargement des votants…</p>;
  }

  const qrEmail = summary.mode === "qr-email";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted">Connexion</span>
        <span
          className={`px-2 py-0.5 text-xs font-semibold ${
            summary.loginOpen ? "bg-green-500/20 text-green-300" : "bg-red-500/20 text-red-300"
          }`}
        >
          {summary.loginOpen ? "Ouverte" : "Fermée"}
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
          <><Lock className="mr-2 h-4 w-4" />Fermer la connexion</>
        ) : (
          <><Unlock className="mr-2 h-4 w-4" />Ouvrir la connexion</>
        )}
      </Button>
      <p className="text-xs text-faint">
        Fermée : les téléphones qui ouvrent le lien attendent. Les votants déjà inscrits peuvent continuer à voter.
      </p>

      <a
        href={QR_SCREEN_PATH}
        target="_blank"
        rel="noopener"
        className="flex w-full items-center justify-center border border-line-strong px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
      >
        <QrCode className="mr-2 h-4 w-4" />
        Afficher le QR code
        <ExternalLink className="ml-2 h-3.5 w-3.5 opacity-70" />
      </a>
      <p className="text-xs text-faint">
        {qrEmail
          ? "Le QR code change toutes les 15 s. Les votants le scannent puis saisissent leur e-mail (un votant par e-mail). Seuls les votants qui ont voté pour toutes les équipes sont comptés."
          : "En ouvrant le lien, chaque téléphone reçoit sa propre session de votant (cookie). Les votes ne sont acceptés que depuis la salle, et seuls les votants qui ont voté pour toutes les équipes sont comptés."}
      </p>

      <div className="bg-white/5 px-3 py-2 text-sm">
        <div className="text-muted">Votants inscrits</div>
        <div className="text-2xl font-bold">{summary.voters}</div>
      </div>
      {qrEmail && (
        <Link
          to="/jvaFHT7xvivJPJqc1QBRWhfayoj/emails"
          className="flex w-full items-center justify-center border border-line-strong px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
        >
          {t("See all emails")}
        </Link>
      )}
      {qrEmail && (
        <a
          href="/jvaFHT7xvivJPJqc1QBRWhfayoj/tirage"
          target="_blank"
          rel="noopener"
          className="flex w-full items-center justify-center bg-hackathon px-4 py-2 text-sm font-semibold text-white hover:bg-hackathon-hover"
        >
          {t("Draw game")}
          <ExternalLink className="ml-2 h-3.5 w-3.5 opacity-70" />
        </a>
      )}
      {qrEmail && <VotersTable />}
    </div>
  );
};
