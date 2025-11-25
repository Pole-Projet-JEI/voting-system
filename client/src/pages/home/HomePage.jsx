import { useEffect, useState, useReducer } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import "./HomePage.css";
import hourGlass from "../../assets/time.png";
import checkIcon from "../../assets/check-icon.png";
import {
  didUserVote,
  getCurrentTeam,
  voteForId,
  checkConnection,
} from "../../service/userApi";
import { routes } from "../../service/apiRoutes";

axios.defaults.withCredentials = true;

const initialState = {
  teamId: null,
  teamName: null,
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
  const navigate = useNavigate();

  const fetchTeam = async () => {
    const result = await getCurrentTeam();
    if (result.success) {
      dispatch({ type: "SET_TEAM_ID", payload: result.data.teamID });
      dispatch({ type: "SET_TEAM_NAME", payload: result.data.teamName });

      if (!result.data.teamID) {
        dispatch({ type: "SET_MODE", payload: "voteIsClosed" });
      }
      // If there IS a team presenting, the mode will be set by checkHasVoted()
    } else {
      dispatch({ type: "SET_MODE", payload: "voteIsClosed" });
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
      if (result.data.hasVoted) {
        dispatch({ type: "SET_HAS_VOTED", payload: true });
        dispatch({ type: "SET_MODE", payload: "thankYouForVoting" });
      } else {
        // User hasn't voted - open voting if team is presenting
        const teamResult = await getCurrentTeam();
        if (teamResult.success && teamResult.data.teamID) {
          dispatch({ type: "SET_MODE", payload: "voteIsOpen" });
        }
      }
    }
  };

  const voteSubmitHandler = async (event) => {
    event.preventDefault();

    if (!state.userVote) {
      alert("Please select Yes or No before submitting");
      return;
    }

    const response = await voteForId(state.teamId, { vote: state.userVote });

    if (response.success) {
      if (response.data.voted) {
        dispatch({ type: "SET_HAS_VOTED", payload: true });
        dispatch({ type: "SET_MODE", payload: "thankYouForVoting" });
      } else {
        alert(response.data.message || "Failed to submit vote");
      }
    } else {
      alert(response.error || "Failed to submit vote. Please try again.");
    }
  };

  useEffect(() => {
    const initializePage = async () => {
      await verifyConnection();
      await fetchTeam();
      await checkHasVoted();
    };

    initializePage();
  }, []);

  useEffect(() => {
    const eventSource = new EventSource(routes.SEND_VOTE, {
      withCredentials: true,
    });

    eventSource.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);

        // Handle connection confirmation
        if (data.connected) {
          console.log("SSE connected");
          return;
        }

        const newTeamId = data.teamID;
        const newTeamName = data.teamName;

        dispatch({ type: "SET_TEAM_ID", payload: newTeamId });
        dispatch({ type: "SET_TEAM_NAME", payload: newTeamName });

        // Reset vote selection
        dispatch({ type: "SET_USER_VOTE", payload: null });

        // Check if user already voted for this new team
        if (newTeamId) {
          const voteStatus = await didUserVote();
          if (voteStatus.success && voteStatus.data.hasVoted) {
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
    };

    eventSource.onerror = () => {
      console.log("SSE connection lost. Will retry...");
      eventSource.close();

      // Don't reload immediately - check if online first
      if (navigator.onLine) {
        setTimeout(() => window.location.reload(), 3000);
      } else {
        // Wait for network to come back
        window.addEventListener(
          "online",
          () => {
            window.location.reload();
          },
          { once: true }
        );
      }
    };

    return () => eventSource.close();
  }, []);

  const VoteOpen = (
    <div className="home-container vote-form-container">
      <h1 className="vote-open-title">
        Your vote for <span style={{ color: "#790C18" }}>{state.teamName}</span>
      </h1>
      <form className="vote-form" onSubmit={voteSubmitHandler}>
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
          className="submit-vote-button"
          disabled={!state.userVote}
        >
          Submit Vote
        </button>
      </form>
      {/* <p style={{ fontSize: '1.5em', fontWeight: '700' }}>01:45</p> */}
    </div>
  );

  const VoteClosed = (
    <div className="home-container">
      <img src={hourGlass} alt="hourglass" width="80px" />
      <div className="home-vote-closed-message">
        <p>Voting is now closed - get ready for the next team!</p>
      </div>
    </div>
  );

  const ThankYouForYourVote = (
    <div className="thank-you-container">
      <h1>Thank you for your vote</h1>
      <img src={checkIcon} alt="check-icon" />
    </div>
  );

  if (state.mode === "voteIsOpen") return VoteOpen;
  if (state.mode === "thankYouForVoting") return ThankYouForYourVote;
  return VoteClosed;
}
