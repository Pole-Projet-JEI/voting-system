import { useEffect, useState } from "react";
import { getLoginStatus } from "../../service/userApi";
import { QrOverlay, RotatingQrOverlay } from "../../components/adminComponents/VotersLoginPanel";

// Projector tab (opened from the dashboard's "Afficher le QR code"): only the
// QR code, full screen. The cross closes the tab.
export default function QrScreenPage() {
  const [mode, setMode] = useState(null);

  useEffect(() => {
    document.title = "QR code de vote";
    let timer = 0;
    const load = async () => {
      const result = await getLoginStatus();
      if (result.success) setMode(result.data.mode || "link");
      else timer = window.setTimeout(load, 2000);
    };
    load();
    return () => window.clearTimeout(timer);
  }, []);

  const close = () => {
    window.close();
    // A tab the script did not open may refuse to close: go back to the dashboard.
    window.setTimeout(() => window.location.assign("/jvaFHT7xvivJPJqc1QBRWhfayoj/dashboard"), 300);
  };

  if (!mode) return <div className="min-h-screen bg-ground" />;
  return mode === "qr-email" ? <RotatingQrOverlay onClose={close} /> : <QrOverlay onClose={close} />;
}
