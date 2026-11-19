import "../register/RegisterPage.css";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { joinWithQr } from "../../service/userApi";
import { VoterBrand } from "../register/RegisterPage";

// Landing page of the rotating QR link: /join?t=<token>.
export default function JoinPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const started = useRef(false);
  const token = params.get("t") || "";

  const join = async () => {
    setBusy(true);
    setError("");
    const result = await joinWithQr(token);
    setBusy(false);
    if (result.success) {
      // Replace the URL so the token is not kept in history or shared by "back".
      navigate("/home", { replace: true });
      return;
    }
    if (result.networkError) {
      setError("Unable to connect to the server. Check your connection and try again.");
      return;
    }
    setError(result.error);
  };

  useEffect(() => {
    if (started.current) {
      return;
    }
    started.current = true;
    join();
  }, []);

  return (
    <div className="register-form-container fie-panel">
      <VoterBrand />
      {busy && <p className="fie-info">Joining the vote...</p>}
      {error && (
        <>
          <p className="fie-error" role="alert">{error}</p>
          <p className="fie-info">
            Scan the QR code shown on the screen again with your phone camera.
          </p>
        </>
      )}
    </div>
  );
}
