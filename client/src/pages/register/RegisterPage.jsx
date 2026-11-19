import "./RegisterPage.css";
import jeiLogo from "../../assets/jei2.png";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { checkConnection, joinVoting } from "../../service/userApi";

const RETRY_MS = 5000;

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

// Landing page of the voting link. There is no login form: the browser gets
// an anonymous voter session cookie automatically, then goes to the vote.
// While the admin keeps login closed, it waits and joins as soon as it opens.
export default function RegisterPage() {
  const [state, setState] = useState("joining"); // joining | closed | error
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    let timer = 0;

    const attempt = async () => {
      const connection = await checkConnection();
      if (!active) return;
      if (connection.success && connection.data.connected) {
        navigate("/home", { replace: true });
        return;
      }
      const result = await joinVoting();
      if (!active) return;
      if (result.success) {
        navigate("/home", { replace: true });
        return;
      }
      if (result.errorCode === "LOGIN_CLOSED") {
        setState("closed");
      } else {
        setState("error");
        setError(
          result.networkError
            ? "Unable to connect to the server. Retrying..."
            : result.error
        );
      }
      timer = window.setTimeout(attempt, RETRY_MS);
    };

    attempt();
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, []);

  return (
    <div className="register-form-container fie-panel">
      <VoterBrand />
      {state === "joining" && <p className="fie-info">Joining the vote...</p>}
      {state === "closed" && (
        <p className="register-closed">
          The vote is not open yet. Keep this page open: you will join automatically
          as soon as the organizers open it.
        </p>
      )}
      {state === "error" && (
        <p className="fie-error" role="alert">{error}</p>
      )}
    </div>
  );
}
