import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import QRCode from "qrcode";
import { Lock, QrCode, Unlock, Upload, X } from "lucide-react";
import { Button } from "../ui/button";
import {
  getVotersSummary,
  importVoterEmails,
  setLoginWindow,
} from "../../service/adminApi";

const EMAIL_IN_TEXT = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

export const extractEmails = (text) => [
  ...new Set((text.match(EMAIL_IN_TEXT) || []).map((email) => email.toLowerCase())),
];

const votingLink = () => `${window.location.origin}/register`;

const QrOverlay = ({ onClose }) => {
  const [dataUrl, setDataUrl] = useState("");

  useEffect(() => {
    QRCode.toDataURL(votingLink(), {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 1024,
    }).then(setDataUrl);
  }, []);

  // Rendered on <body> so the sidebar's scroll container cannot show through.
  // z-index must stay above .admin-page (z-index 9999 in AdminPage.css).
  return createPortal(
    <div className="fixed inset-0 z-[10000] flex flex-col items-center justify-center gap-6 bg-white p-6">
      <button
        type="button"
        onClick={onClose}
        className="absolute right-6 top-6 rounded-full p-2 text-gray-500 hover:bg-gray-100"
        aria-label="Close QR code"
      >
        <X className="h-8 w-8" />
      </button>
      <h2 className="text-center text-4xl font-bold text-gray-900">Scan to vote</h2>
      {dataUrl && (
        <img
          src={dataUrl}
          alt={`QR code for ${votingLink()}`}
          className="h-auto w-[min(80vh,90vw)]"
        />
      )}
      <p className="text-center text-3xl font-semibold text-gray-800">
        {window.location.host}
      </p>
    </div>,
    document.body
  );
};

export const VotersLoginPanel = ({ onNotify }) => {
  const [summary, setSummary] = useState(null);
  const [pasted, setPasted] = useState("");
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

  const importEmails = async (emails) => {
    if (emails.length === 0) {
      onNotify?.("error", "No email address found.");
      return;
    }
    setBusy(true);
    const result = await importVoterEmails(emails);
    setBusy(false);
    if (!result.success) {
      onNotify?.("error", result.error);
      return;
    }
    const { added, alreadyListed, invalidCount } = result.data;
    onNotify?.(
      "success",
      `${added} added, ${alreadyListed} already on the list${invalidCount ? `, ${invalidCount} invalid` : ""}.`
    );
    setPasted("");
    refresh();
  };

  const onFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) {
      importEmails(extractEmails(await file.text()));
    }
  };

  if (!summary) {
    return <p className="text-sm text-slate-300">Loading voters...</p>;
  }

  const pastedCount = extractEmails(pasted).length;

  return (
    <div className="space-y-3">
      {showQr && <QrOverlay onClose={() => setShowQr(false)} />}

      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-300">Login</span>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
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
            ? "w-full bg-red-600 text-white hover:bg-red-700"
            : "w-full bg-green-600 text-white hover:bg-green-700"
        }
      >
        {summary.loginOpen ? (
          <><Lock className="mr-2 h-4 w-4" />Close login</>
        ) : (
          <><Unlock className="mr-2 h-4 w-4" />Open login</>
        )}
      </Button>
      <p className="text-xs text-slate-400">
        Closing stops new logins. Voters already logged in can keep voting.
      </p>

      <Button
        type="button"
        variant="outline"
        onClick={() => setShowQr(true)}
        className="w-full border-white/20 text-white hover:bg-white/10"
      >
        <QrCode className="mr-2 h-4 w-4" />
        Show QR code
      </Button>

      {!summary.mailerConfigured && (
        <div className="rounded-md border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          Email sending is not configured on the server: voters cannot receive codes yet.
        </div>
      )}

      <div className="rounded-md bg-white/5 px-3 py-2 text-sm">
        <div className="text-slate-300">Allowed voter emails</div>
        <div className="text-2xl font-bold">{summary.emailVoters}</div>
        {summary.allowedDomains.length > 0 && (
          <div className="text-xs text-slate-400">
            + any address @{summary.allowedDomains.join(", @")}
          </div>
        )}
      </div>

      <textarea
        value={pasted}
        onChange={(event) => setPasted(event.target.value)}
        rows={3}
        placeholder="Paste emails (any format: one per line, CSV, Excel copy...)"
        className="w-full rounded-md border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-slate-400 outline-none focus:border-white/50"
      />
      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          onClick={() => importEmails(extractEmails(pasted))}
          disabled={busy || pastedCount === 0}
          variant="outline"
          className="border-white/20 text-white hover:bg-white/10"
        >
          Add {pastedCount || ""}
        </Button>
        <label className="flex cursor-pointer items-center justify-center rounded-md border border-white/20 px-3 text-sm text-white hover:bg-white/10">
          <Upload className="mr-2 h-4 w-4" />
          CSV / TXT
          <input type="file" accept=".csv,.txt,text/csv,text/plain" onChange={onFile} className="hidden" />
        </label>
      </div>
      <p className="text-xs text-slate-400">
        Excel: save as CSV first, or copy the email column and paste it above.
      </p>
    </div>
  );
};
