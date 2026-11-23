import "../register/RegisterPage.css";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { checkConnection, joinVoting, scanQr } from "../../service/userApi";
import { VoterBrand } from "../register/RegisterPage";

// qr-email mode. The QR code on the screen opens /join?t=<token>:
//   1. the token is checked at once (it only lives 25 s + 10 s) and the phone
//      gets a 10-minute pass; the token is then removed from the address;
//   2. the voter types an email at their own pace and joins.
// /join without a token shows the email form directly (reload, or pass
// already given); the server says if the QR code must be scanned again.
export default function JoinPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("t") || "";
  const [step, setStep] = useState("checking"); // checking | email | scanAgain
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const started = useRef(false);

  const showError = (result) =>
    setError(
      result.networkError
        ? "Unable to connect to the server. Check your connection and try again."
        : result.error
    );

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      const connection = await checkConnection();
      if (connection.success && connection.data.connected) {
        navigate("/home", { replace: true });
        return;
      }
      if (!token) {
        setStep("email");
        return;
      }
      const result = await scanQr(token);
      if (result.success) {
        navigate("/join", { replace: true });
        setStep("email");
        return;
      }
      setStep("scanAgain");
      showError(result);
    })();
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const result = await joinVoting({ email });
    setBusy(false);
    if (result.success) {
      navigate("/home", { replace: true });
      return;
    }
    if (result.errorCode === "QR_REQUIRED" || result.errorCode === "LOGIN_CLOSED") {
      setStep("scanAgain");
    }
    showError(result);
  };

  return (
    <div className="register-form-container fie-panel">
      <VoterBrand />
      {step === "checking" && <p className="fie-info">Checking the QR code...</p>}

      {step === "email" && (
        <form className="join-email-form" onSubmit={submit} noValidate>
          <label htmlFor="voter-email" className="join-email-label">Your email</label>
          <input
            id="voter-email"
            className="join-email-input"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck="false"
            placeholder="name@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          <button type="submit" className="fie-btn join-email-submit" disabled={busy || !email.trim()}>
            {busy ? "Joining..." : "Start voting"}
          </button>
          <p className="register-hint">One email per person. Use the same email if you switch phones.</p>
          {error && <p className="fie-error" role="alert">{error}</p>}
        </form>
      )}

      {step === "scanAgain" && (
        <>
          {error && <p className="fie-error" role="alert">{error}</p>}
          <p className="fie-info">Scan the QR code shown on the screen again with your phone camera.</p>
        </>
      )}
    </div>
  );
}
