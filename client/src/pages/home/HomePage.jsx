import { useEffect, useRef, useState, useReducer } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import "./HomePage.css";
import {
  didUserVote,
  getCurrentTeam,
  checkConnection,
  getGeofenceStatus,
} from "../../service/userApi";
import { getLocationPermission, getVoterLocation } from "../../service/geolocation";
import {
  attemptVote,
  getPendingVote,
  rememberVotedTeam,
  setPendingVote,
} from "../../service/voteSubmission";
import { routes } from "../../service/apiRoutes";
import { createSseConnection } from "../../service/sseConnection";

axios.defaults.withCredentials = true;

const initialState = {
  teamId: null,
  teamName: null,
  teamState: null,
  hasVoted: false,
  userVote: null,
  mode: "voteIsClosed", // 'voteIsOpen', 'thankYouForVoting'
};

const reducer = (state, action) => {
  switch (action.type) {
    case "SET_TEAM_ID":
      return { ...state, teamId: action.payload };
    case "SET_TEAM_NAME":
      return { ...state, teamName: action.payload };
    case "SET_TEAM_STATE":
      return { ...state, teamState: action.payload };
    case "SET_HAS_VOTED":
      return { ...state, hasVoted: action.payload };
    case "SET_USER_VOTE":
      return { ...state, userVote: action.payload };
    case "SET_MODE":
      return { ...state, mode: action.payload };
    default:
      return state;
  }
};

export default function HomePage() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [pageError, setPageError] = useState("");
  const [voteError, setVoteError] = useState("");
  const [submitStatus, setSubmitStatus] = useState(null); // null | 'locating' | 'sending'
  const retryInFlight = useRef(false);
  // Venue location check. geofenceEnabled: null until loaded.
  // location: "unknown" | "needed" | "checking" | "ready" | "error"
  const [geofenceEnabled, setGeofenceEnabled] = useState(null);
  const [locationState, setLocationState] = useState("unknown");
  const [locationError, setLocationError] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      const status = await getGeofenceStatus();
      if (!active || !status.success) return;
      const enabled = status.data.enabled === true;
      setGeofenceEnabled(enabled);
      if (!enabled) {
        setLocationState("ready");
        return;
      }
      // Already allowed on this browser: no extra step.
      const permission = await getLocationPermission();
      if (active) setLocationState(permission === "granted" ? "ready" : "needed");
    })();
    return () => {
      active = false;
    };
  }, []);

  // Runs directly inside the tap, so iPhone Safari shows its permission prompt.
  const allowLocation = async () => {
    setLocationError("");
    setLocationState("checking");
    const result = await getVoterLocation({ windowMs: 2500 });
    if (result.success) {
      setLocationState("ready");
    } else {
      setLocationState("error");
      setLocationError(result.error);
    }
  };

  const showThankYou = () => {
    dispatch({ type: "SET_HAS_VOTED", payload: true });
    dispatch({ type: "SET_MODE", payload: "thankYouForVoting" });
  };
  const navigate = useNavigate();

  const fetchTeam = async () => {
    const result = await getCurrentTeam();
    if (result.success) {
      setPageError("");
      dispatch({ type: "SET_TEAM_ID", payload: result.data.teamID });
      dispatch({ type: "SET_TEAM_NAME", payload: result.data.teamName });
      dispatch({ type: "SET_TEAM_STATE", payload: result.data.state });

      if (!result.data.teamID) {
        dispatch({ type: "SET_MODE", payload: "voteIsClosed" });
      } else if (result.data.state === "presenting") {
        dispatch({ type: "SET_MODE", payload: "teamIsPresenting" });
      }
      // If there IS a team presenting, the mode will be set by checkHasVoted()
    } else if (getPendingVote()) {
      showThankYou();
    } else {
      setPageError("Unable to load voting status. Please try again.");
      dispatch({ type: "SET_MODE", payload: "voteError" });
    }
  };

  const verifyConnection = async () => {
    const result = await checkConnection();
    if (result.success && !result.data.connected) {
      navigate("/register");
    }
  };

  const checkHasVoted = async () => {
    const result = await didUserVote();
    if (result.success) {
      const teamResult = await getCurrentTeam();
      const teamState =
        teamResult.data?.state ||
        (teamResult.data?.teamID ? "voting" : null);

      if (teamResult.success && teamState === "presenting") {
        dispatch({ type: "SET_MODE", payload: "teamIsPresenting" });
      } else if (result.data.hasVoted) {
        dispatch({ type: "SET_HAS_VOTED", payload: true });
        dispatch({ type: "SET_MODE", payload: "thankYouForVoting" });
      } else if (teamResult.success && teamState === "voting") {
          dispatch({ type: "SET_MODE", payload: "voteIsOpen" });
      } else if (!teamResult.success && getPendingVote()) {
        showThankYou();
      } else if (!teamResult.success) {
        setPageError("Unable to load voting status. Please try again.");
        dispatch({ type: "SET_MODE", payload: "voteError" });
      }
    }
  };

  const voteSubmitHandler = async (event) => {
    event.preventDefault();
    setVoteError("");

    if (!state.userVote) {
      setVoteError("Please select Yes or No before submitting.");
      return;
    }

    if (submitStatus) {
      return;
    }

    const teamId = state.teamId;
    const vote = state.userVote;

    setSubmitStatus("sending");
    const outcome = await attemptVote(teamId, vote, {
      onLocating: () => setSubmitStatus("locating"),
      geofenceEnabled: geofenceEnabled ?? undefined,
    });
    setSubmitStatus(null);

    if (outcome.kind === "saved") {
      rememberVotedTeam(teamId);
      showThankYou();
      return;
    }

    if (outcome.kind === "retry") {
      // Server unreachable or failing: keep the vote on the phone, retry in
      // the background, and show the normal confirmation.
      setPendingVote({ teamId, vote, createdAt: Date.now() });
      rememberVotedTeam(teamId);
      showThankYou();
      return;
    }

    if (outcome.kind === "unauthenticated") {
      navigate("/register");
      return;
    }

    if (outcome.code === "PERMISSION_DENIED" || outcome.code === "APPROXIMATE") {
      // Show the step-by-step location card instead of the form.
      setLocationError(outcome.message);
      setLocationState("error");
      return;
    }
    setVoteError(outcome.message);
  };

  const LocationStep =
    geofenceEnabled && locationState !== "ready" && locationState !== "unknown" ? (
      <div className="location-step" role={locationState === "error" ? "alert" : undefined}>
        <span className="fie-label">Location check</span>
        <p className="fie-info">
          Votes are only accepted from inside the room. Allow your location once, and
          turn on <strong>precise location</strong> if your phone asks.
        </p>
        {locationError && <p className="fie-error">{locationError}</p>}
        <button
          type="button"
          className="fie-btn location-step-button"
          onClick={allowLocation}
          disabled={locationState === "checking"}
        >
          {locationState === "checking"
            ? "Checking your location..."
            : locationState === "error"
              ? "Try again"
              : "Allow location"}
        </button>
      </div>
    ) : null;

  // Background retry for a vote that could not reach the server.
  useEffect(() => {
    const flushPendingVote = async () => {
      const pending = getPendingVote();
      if (!pending || retryInFlight.current) {
        return;
      }

      retryInFlight.current = true;
      try {
        const outcome = await attemptVote(pending.teamId, pending.vote);
        if (outcome.kind === "retry") {
          return;
        }
        setPendingVote(null);
        if (outcome.kind === "saved") {
          rememberVotedTeam(pending.teamId);
        } else {
          console.warn("Pending vote dropped:", outcome.code || outcome.message);
        }
      } finally {
        retryInFlight.current = false;
      }
    };

    flushPendingVote();
    const timer = setInterval(flushPendingVote, 5000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const initializePage = async () => {
      await verifyConnection();
      await fetchTeam();
      await checkHasVoted();

    };

    initializePage();
  }, []);

  useEffect(() => {
    const connection = createSseConnection({
      url: routes.SEND_VOTE,
      onMessage: async (event, isActive) => {
        try {
          const data = JSON.parse(event.data);

          if (data.connected) {
            return;
          }

          if (data.voteUpdate) {
            return;
          }

          const newTeamId = data.teamID;
          const newTeamName = data.teamName;

          if (!isActive()) {
            return;
          }

          dispatch({ type: "SET_TEAM_ID", payload: newTeamId });
          dispatch({ type: "SET_TEAM_NAME", payload: newTeamName });
          dispatch({ type: "SET_TEAM_STATE", payload: data.state });

          // Reset vote selection
          dispatch({ type: "SET_USER_VOTE", payload: null });

          // Check if user already voted for this new team
          if (newTeamId) {
            const voteStatus = await didUserVote();
            if (!isActive()) {
              return;
            }

            if (data.state === "presenting") {
              dispatch({ type: "SET_MODE", payload: "teamIsPresenting" });
            } else if (voteStatus.success && voteStatus.data.hasVoted) {
              dispatch({ type: "SET_HAS_VOTED", payload: true });
              dispatch({ type: "SET_MODE", payload: "thankYouForVoting" });
            } else {
              dispatch({ type: "SET_HAS_VOTED", payload: false });
              dispatch({ type: "SET_MODE", payload: "voteIsOpen" });
            }
          } else {
            // No team presenting
            dispatch({ type: "SET_MODE", payload: "voteIsClosed" });
          }
        } catch (error) {
          console.error("Error processing SSE message:", error);
        }
      },
    });

    connection.start();
    return () => connection.stop();
  }, []);

  const VoteOpen = (
    <div className="home-container vote-form-container fie-panel">
      <h1 className="vote-open-title">
        Your vote for <span className="team-name">{state.teamName}</span>
      </h1>
      {LocationStep}
      {!LocationStep && (
      <form className="vote-form" onSubmit={voteSubmitHandler}>
        {voteError && (
          <div className="fie-error" role="alert">
            {voteError}
          </div>
        )}
        <div className="vote-buttons">
          <button
            name="vote-yes"
            id="vote-yes"
            type="button"
            className={
              state.userVote === "yes" ? "vote-option selected" : "vote-option"
            }
            onClick={() => dispatch({ type: "SET_USER_VOTE", payload: "yes" })}
          >
            Yes
          </button>
          <button
            name="vote-no"
            id="vote-no"
            type="button"
            className={
              state.userVote === "no" ? "vote-option selected" : "vote-option"
            }
            onClick={() => dispatch({ type: "SET_USER_VOTE", payload: "no" })}
          >
            No
          </button>
        </div>
        <button
          type="submit"
          className="submit-vote-button fie-btn"
          disabled={!state.userVote || Boolean(submitStatus)}
        >
          {submitStatus === "locating"
            ? "Checking your location..."
            : submitStatus === "sending"
              ? "Submitting..."
              : "Submit Vote"}
        </button>
      </form>
      )}
      {/* <p style={{ fontSize: '1.5em', fontWeight: '700' }}>01:45</p> */}
    </div>
  );

  const VoteClosed = (
    <div className="home-container fie-panel">
      <span className="fie-label">Waiting</span>
      <div className="home-vote-closed-message">
        <p>Voting is now closed - get ready for the next team!</p>
      </div>
      {LocationStep}
    </div>
  );

  const TeamIsPresenting = (
    <div className="home-container fie-panel">
      <span className="fie-label">On stage</span>
      <h1 className="vote-open-title">
        <span className="team-name">{state.teamName}</span> is presenting
      </h1>
      <p className="home-vote-progress">Voting will open shortly.</p>
      {LocationStep}
    </div>
  );

  const VoteError = (
    <div className="home-container fie-panel">
      <div className="home-vote-closed-message" role="alert">
        <p>{pageError}</p>
      </div>
    </div>
  );

  const ThankYouForYourVote = (
    <div className="thank-you-container fie-panel">
      <span className="thank-you-mark" aria-hidden="true">
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="square">
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      </span>
      <h1>Thank you for your vote</h1>
    </div>
  );

  if (state.mode === "voteIsOpen") return VoteOpen;
  if (state.mode === "teamIsPresenting") return TeamIsPresenting;
  if (state.mode === "thankYouForVoting") return ThankYouForYourVote;
  if (state.mode === "voteError") return VoteError;
  return VoteClosed;
}
