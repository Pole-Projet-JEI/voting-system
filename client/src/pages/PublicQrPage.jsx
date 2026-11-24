import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getScreenQr } from "../service/userApi";
import { RotatingQrOverlay } from "../components/adminComponents/VotersLoginPanel";
import { voteSiteOrigin } from "../config/screenHosts";

// Public projector screen: /qr/<key>, no login. Shows the rotating QR code of
// the vote site. A wrong or changed key shows a plain message.
export default function PublicQrPage() {
  const { key } = useParams();
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    document.title = "QR code de vote";
  }, []);

  if (invalid) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ground p-6 text-center text-xl text-muted">
        Ce lien d'écran n'est pas valide. Demandez le lien à jour aux organisateurs.
      </div>
    );
  }
  return (
    <RotatingQrOverlay
      fetchQr={() => getScreenQr(key)}
      joinOrigin={voteSiteOrigin()}
      onNotFound={() => setInvalid(true)}
    />
  );
}
