import "./RegisterPage.css";
import jeiLogo from "../../assets/jei2.png";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  checkConnection,
  getLoginStatus,
  requestEmailCode,
  verifyEmailCode,
} from "../../service/userApi";

const LOGIN_STATUS_POLL_MS = 5000;

const formatSeconds = (seconds) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

const ArrowIcon = () => (
  <svg width="25px" height="25px" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M3 14a1 1 0 0 1 1-1h12a3 3 0 0 0 3-3V6a1 1 0 1 1 2 0v4a5 5 0 0 1-5 5H4a1 1 0 0 1-1-1z"
      fill="#ffffff"
    />
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M3.293 14.707a1 1 0 0 1 0-1.414l4-4a1 1 0 0 1 1.414 1.414L5.414 14l3.293 3.293a1 1 0 1 1-1.414 1.414l-4-4z"
      fill="#ffffff"
    />
  </svg>
);

export default function RegisterPage() {
  const [loginOpen, setLoginOpen] = useState(null); // null = unknown yet
  const [step, setStep] = useState("email"); // 'email' | 'code'
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  const [retryAfterSeconds, setRetryAfterSeconds] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    if (retryAfterSeconds <= 0) {
      return undefined;
    }
    const timer = window.setInterval(() => {
      setRetryAfterSeconds((seconds) => Math.max(0, seconds - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [retryAfterSeconds]);

  useEffect(() => {
    checkConnection().then((result) => {
      if (result.success && result.data.connected) {
        navigate("/home");
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

  const showFailure = (result) => {
    if (result.errorCode === "LOGIN_CLOSED") {
      setLoginOpen(false);
    }
    setError(
      result.networkError
        ? "Unable to connect to the server. Please try again."
        : result.error
    );
    setRetryAfterSeconds(result.retryAfterSeconds || 0);
  };

  const sendCode = async (event) => {
    event?.preventDefault();
    if (busy || retryAfterSeconds > 0 || !email.trim()) {
      return;
    }
    setBusy(true);
    setError("");
    setInfo("");
    const result = await requestEmailCode(email.trim());
    setBusy(false);

    if (result.success) {
      setStep("code");
      setCode("");
      setInfo(`We sent a 6-digit code to ${email.trim()}. Check your spam folder too.`);
      setRetryAfterSeconds(30);
      return;
    }
    if (result.errorCode === "COOLDOWN") {
      setStep("code");
    }
    showFailure(result);
  };

  const submitCode = async (event) => {
    event.preventDefault();
    if (busy || code.length !== 6) {
      return;
    }
    setBusy(true);
    setError("");
    const result = await verifyEmailCode(email.trim(), code);
    setBusy(false);

    if (result.success) {
      navigate("/home");
      return;
    }
    if (result.errorCode === "CODE_EXPIRED_OR_LOCKED" || result.errorCode === "NO_CODE") {
      setCode("");
    }
    showFailure({ ...result, retryAfterSeconds: 0 });
  };

  const header = (
    <>
      <img src={jeiLogo} alt="JEILogo" width="100px" height="50px" />
      <div className="title-container">
        <h1 className="title-G">Hack for Good</h1>
        <h1 className="title-2">4.0</h1>
      </div>
      <h2 style={{ fontSize: "1em", color: "rgba(255,255,255,0.55)" }}>
        Voting System
      </h2>
    </>
  );

  if (loginOpen === false) {
    return (
      <div className="register-form-container">
        {header}
        <p className="register-closed">
          Login is closed for now. Keep this page open: it will unlock as soon as the
          organizers open the vote.
        </p>
      </div>
    );
  }

  return (
    <div className="register-form-container">
      {header}

      {info && !error && (
        <p style={{ color: "rgba(255,255,255,0.8)", textAlign: "center" }}>{info}</p>
      )}
      {error && (
        <p style={{ color: "#ffb4b4", textAlign: "center" }} role="alert">
          {error}
        </p>
      )}

      {step === "email" ? (
        <form onSubmit={sendCode} style={{ width: "100%" }}>
          <div className="register-field">
            <input
              type="email"
              name="email"
              id="unique-code"
              placeholder="Enter your email"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button
              id="register-form-submit"
              type="submit"
              disabled={busy || retryAfterSeconds > 0 || loginOpen !== true}
              aria-label="Send code"
            >
              <ArrowIcon />
            </button>
          </div>
          {retryAfterSeconds > 0 && (
            <p className="register-hint">Try again in {formatSeconds(retryAfterSeconds)}</p>
          )}
          <p className="register-hint">
            {busy ? "Sending..." : "You will receive a 6-digit code by email."}
          </p>
        </form>
      ) : (
        <form onSubmit={submitCode} style={{ width: "100%" }}>
          <div className="register-field">
            <input
              type="text"
              name="one-time-code"
              id="unique-code"
              placeholder="6-digit code"
              autoComplete="one-time-code"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            />
            <button
              id="register-form-submit"
              type="submit"
              disabled={busy || code.length !== 6}
              aria-label="Verify code"
            >
              <ArrowIcon />
            </button>
          </div>
          <div className="register-links">
            <button
              type="button"
              className="register-link"
              onClick={sendCode}
              disabled={busy || retryAfterSeconds > 0}
            >
              {retryAfterSeconds > 0
                ? `Resend code in ${formatSeconds(retryAfterSeconds)}`
                : "Resend code"}
            </button>
            <button
              type="button"
              className="register-link"
              onClick={() => {
                setStep("email");
                setError("");
                setInfo("");
              }}
            >
              Change email
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
