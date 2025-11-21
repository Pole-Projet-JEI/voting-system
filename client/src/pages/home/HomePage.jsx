import { useEffect, useState, useReducer } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import "./HomePage.css";
import hourGlass from "../../assets/time.png";
import checkIcon from "../../assets/check-icon.png";
import {
  didUserVote,
  getCurrentTeam,
  sendVote,
  voteForId,
  checkConnection,
  verifyPosition,
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
  const [isLocationChecked, setIsLocationChecked] = useState(false); // Track geolocation status
  const [locationAllowed, setLocationAllowed] = useState(false);
  const navigate = useNavigate();

  const fetchTeam = async () => {
    try {
      const result = await getCurrentTeam();
      dispatch({ type: "SET_TEAM_ID", payload: result.teamID });
      dispatch({ type: "SET_TEAM_NAME", payload: result.teamName });

      if (!result.teamID) {
        dispatch({ type: "SET_MODE", payload: "voteIsClosed" });
      }
      // If there IS a team presenting, the mode will be set by checkHasVoted()
    } catch (error) {
      console.error("Error fetching team:", error);
      dispatch({ type: "SET_MODE", payload: "voteIsClosed" });
    }
  };

  const checkPosition = async () => {
    // GEOLOCATION DISABLED - Skip position verification
    setLocationAllowed(true);
    return Promise.resolve();

    /* COMMENTED OUT - Re-enable for production with GPS verification
        return new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(
                async (position) => {
                    const userLatitude = position.coords.latitude;
                    const userLongitude = position.coords.longitude;
                    const accuracy=position.coords.accuracy;
                    const result = await verifyPosition({ latitude: userLatitude, longitude: userLongitude,accuracy:accuracy });
                    if (!result.valid) {
                        setLocationAllowed(false);
                        reject("Invalid position");
                    } else {
                        setLocationAllowed(true);
                        resolve();
                    }
                },
                (error) => {
                    console.error("Geolocation error:", error);
                    reject("Geolocation error");
                },
                { enableHighAccuracy: true, timeout: 1000 * 120, maximumAge: 0 }
            );
        });
        */
  };

  const verifyConnection = async () => {
    try {
      const result = await checkConnection();
      if (!result.connected) navigate("/register");
    } catch (error) {
      console.error("Error verifying connection", error);
    }
  };

  const checkHasVoted = async () => {
    try {
      const result = await didUserVote();
      if (result.hasVoted) {
        dispatch({ type: "SET_HAS_VOTED", payload: true });
        dispatch({ type: "SET_MODE", payload: "thankYouForVoting" });
      } else {
        // User hasn't voted - open voting if team is presenting
        const teamResult = await getCurrentTeam();
        if (teamResult.teamID) {
          dispatch({ type: "SET_MODE", payload: "voteIsOpen" });
        }
      }
    } catch (error) {
      console.error("Error checking vote status", error);
    }
  };

  const voteSubmitHandler = async (event) => {
    event.preventDefault();

    if (!state.userVote) {
      alert("Please select Yes or No before submitting");
      return;
    }

    try {
      const response = await voteForId(state.teamId, { vote: state.userVote });

      if (response.voted) {
        dispatch({ type: "SET_HAS_VOTED", payload: true });
        dispatch({ type: "SET_MODE", payload: "thankYouForVoting" });
      } else {
        alert(response.message || "Failed to submit vote");
      }
    } catch (error) {
      console.error("Error submitting vote", error);
      const errorMessage =
        error.response?.data?.message ||
        "Failed to submit vote. Please try again.";
      alert(errorMessage);
    }
  };

  useEffect(() => {
    const initializePage = async () => {
      try {
        await checkPosition();
        await verifyConnection();
        await fetchTeam();
        await checkHasVoted();
        setIsLocationChecked(true);
        // console.log(isLocationChecked);
        // console.log("bye");
      } catch (error) {
        setIsLocationChecked(true);
        console.error("Error during initialization:", error);
      }
    };

    initializePage();
  }, []); // empty ensures this runs once on component mount

  useEffect(() => {
    const eventSource = new EventSource(routes.SEND_VOTE, {
      withCredentials: true,
    });

    eventSource.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.connected) {
          // console.log("SSE connected");
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
          if (voteStatus.hasVoted) {
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
      // console.log("SSE connection lost. Will retry...");
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
        <p>The team is still presenting; voting will open soon</p>
      </div>
    </div>
  );

  const ThankYouForYourVote = (
    <div className="thank-you-container">
      <h1>Thank you for your vote</h1>
      <img src={checkIcon} alt="check-icon" />
    </div>
  );

  // Wait until location check is complete before rendering the vote UI
  if (!isLocationChecked) {
    return <div>Loading...</div>; // Display a loading message or spinner
  }

  // Render based on mode
  if (locationAllowed === false)
    return (
      <div>
        <h1
          style={{
            fontSize: "1em",
            textAlign: "center",
          }}
        >
          Voting is only available inside the auditorium. Please enter the venue
          to proceed.
        </h1>
      </div>
    );
  if (state.mode === "voteIsOpen") return VoteOpen;
  if (state.mode === "thankYouForVoting") return ThankYouForYourVote;
  return VoteClosed;
}
