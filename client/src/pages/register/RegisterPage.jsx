import "./RegisterPage.css";
import jeiLogo from "../../assets/jei2.png";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { checkConnection, getLoginStatus } from "../../service/userApi";

const LOGIN_STATUS_POLL_MS = 5000;

export const VoterBrand = () => (
  <div className="register-brand">
    <img src={jeiLogo} alt="Junior Entreprise INSAT" />
    <span className="triband" aria-hidden="true"><span /><span /><span /></span>
    <h1 className="title-container">
      <span className="title-G">Hackathon AI Éthique</span>{" "}
      <span className="title-2">360</span>
    </h1>
    <span className="fie-label register-subtitle">Voting system</span>
  </div>
);

const QrIcon = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <rect x="3" y="3" width="7" height="7" />
    <rect x="14" y="3" width="7" height="7" />
    <rect x="3" y="14" width="7" height="7" />
    <path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3" />
  </svg>
);

// Voters arrive here without a valid QR link (or after their session ended).
// Access is only through the rotating QR code shown in the room.
export default function RegisterPage() {
  const [loginOpen, setLoginOpen] = useState(null); // null = unknown yet
  const navigate = useNavigate();

  useEffect(() => {
    checkConnection().then((result) => {
      if (result.success && result.data.connected) {
        navigate("/home", { replace: true });
      }
    });
  }, []);

  // Follow the admin's open/close switch without reloading the page.
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      const result = await getLoginStatus();
      if (active && result.success) {
        setLoginOpen(result.data.open === true);
      }
    };
    refresh();
    const timer = window.setInterval(refresh, LOGIN_STATUS_POLL_MS);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  return (
    <div className="register-form-container fie-panel">
      <VoterBrand />
      {loginOpen === false ? (
        <p className="register-closed">
          Login is closed for now. When the organizers open the vote, scan the QR code
          shown on the screen.
        </p>
      ) : (
        <div className="register-scan">
          <span className="register-scan-icon"><QrIcon /></span>
          <p className="fie-info">
            Scan the <strong>QR code on the screen</strong> with your phone camera to
            join the vote. The code changes every few seconds, so scan it live in the room.
          </p>
        </div>
      )}
    </div>
  );
}
