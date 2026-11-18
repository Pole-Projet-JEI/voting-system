import "./RegisterPage.css";
import { useEffect, useState } from "react";
import { registerUser } from "../../service/userApi";
import { useNavigate } from "react-router-dom";
import { checkConnection } from "../../service/userApi";
export default function RegisterPage() {
  const [userInput, setUserInput] = useState("");
  const [error, setError] = useState("");
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
    const isConnected = async () => {
      const result = await checkConnection();
      if (result.success && result.data.connected) {
        navigate("/home");

      }
    };
    isConnected();
  }, []);

  const submitHandler = async (event) => {
    event.preventDefault();
    if (retryAfterSeconds > 0) {
      return;
    }

    setError("");
    const result = await registerUser(userInput);
    if (result.success) {
      navigate("/home");
    } else {
      setError(
        result.networkError
          ? "Unable to connect to the server. Please try again."
          : result.error || "Invalid voter code."
      );
      setRetryAfterSeconds(result.retryAfterSeconds || 0);
    }
  };

  return (
    <div className="register-form-container">
      <div className="title-container">
        <h1 className="title-G">Hack for Good</h1>
        <h1 className="title-2">4.0</h1>
      </div>
      <h2 style={{ fontSize: "1em", color: "rgba(255,255,255,0.55)" }}>
        Voting System
      </h2>
      {error && (
        <p className="text-error" style={{ marginBottom: "1rem" }}>
          {error}
          {retryAfterSeconds > 0 && (
            <>
              {" "}
              Retry in {Math.floor(retryAfterSeconds / 60)}:
              {String(retryAfterSeconds % 60).padStart(2, "0")}
            </>
          )}
        </p>
      )}
      <form onSubmit={submitHandler} style={{ position: "relative" }}>
        <input
          type="text"
          name="unique-code"
          id="unique-code"
          placeholder="Enter your code"
          value={userInput}
          onChange={(e) => {
            setUserInput(e.target.value);
          }}
        />
        <button
          id="register-form-submit"
          type="submit"
          disabled={retryAfterSeconds > 0}
        >
          <svg
            width="25px"
            height="25px"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <g id="SVGRepo_bgCarrier" strokeWidth="0"></g>
            <g
              id="SVGRepo_tracerCarrier"
              strokeLinecap="round"
              strokeLinejoin="round"
            ></g>
            <g id="SVGRepo_iconCarrier">
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M3 14a1 1 0 0 1 1-1h12a3 3 0 0 0 3-3V6a1 1 0 1 1 2 0v4a5 5 0 0 1-5 5H4a1 1 0 0 1-1-1z"
                fill="#ffffff"
              ></path>
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M3.293 14.707a1 1 0 0 1 0-1.414l4-4a1 1 0 0 1 1.414 1.414L5.414 14l3.293 3.293a1 1 0 1 1-1.414 1.414l-4-4z"
                fill="#ffffff"
              ></path>
            </g>
          </svg>
        </button>
      </form>
    </div>
  );
}
