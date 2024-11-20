import { useEffect, useState, useReducer } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import './HomePage.css';
import hourGlass from "../../assets/time.png";
import checkIcon from "../../assets/check-icon.png";
import { didUserVote, getCurrentTeam, sendVote, voteForId, checkConnection, verifyPosition } from "../../service/api";
import { routes } from "../../service/apiRoutes";

axios.defaults.withCredentials = true;

const initialState = {
    teamId: -1,
    hasVoted: false,
    userVote: null,
    mode: 'voteIsClosed', // 'voteIsOpen', 'thankYouForVoting'
};

const reducer = (state, action) => {
    switch (action.type) {
        case "SET_TEAM_ID":
            return { ...state, teamId: action.payload };
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
    const [locationAllowed,setLocationAllowed] = useState(false);
    const navigate = useNavigate();

    // Async functions
    const fetchTeamId = async () => {
        try {
            const result = await getCurrentTeam();
            dispatch({ type: "SET_TEAM_ID", payload: result.teamID });
            result.teamID == -1 ? dispatch({ type: "SET_MODE", payload: "voteIsClosed" }):
                              dispatch({ type: "SET_MODE", payload: "voteIsOpen" });
        } catch (error) {
            console.error("Error fetching team ID", error);
        }
    };

    const checkPosition = async () => {
        return new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(
                async (position) => {
                    const userLatitude = position.coords.latitude;
                    const userLongitude = position.coords.longitude;
                    const accuracy=position.coords.accuracy;
                    const result = await verifyPosition({ latitude: userLatitude, longitude: userLongitude,accuracy:accuracy });
                    if (!result.valid) {
                        /* navigate("*", {
                            state: {
                                message: "Voting is only available inside the auditorium. Please enter the venue to proceed.",
                            },
                        }); */
                        setLocationAllowed(false);
                        reject("Invalid position");
                    } else {
                        setLocationAllowed(true);
                        resolve(); // Resolve the promise if the position is valid
                    }
                },
                (error) => {
                    console.error("Geolocation error:", error);
                    reject("Geolocation error");
                },
                { enableHighAccuracy: true, timeout: 1000 * 120, maximumAge: 0 }
            );
        });
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
            }
        } catch (error) {
            console.error("Error checking vote status", error);
        }
    };

    const voteSubmitHandler = async (event, userVote) => {
        event.preventDefault();
        try {
            const response = voteForId(state.teamId, { vote: userVote });
            if (true) {
                dispatch({ type: "SET_HAS_VOTED", payload: true });
                dispatch({ type: "SET_MODE", payload: "thankYouForVoting" });
            }
        } catch (error) {
            console.error("Error submitting vote", error);
        }
    };

    useEffect(() => {
        const initializePage = async () => {
            try {
                await checkPosition();
                await verifyConnection();
                await fetchTeamId();
                await checkHasVoted();
                setIsLocationChecked(true);
            } catch (error) {
                setIsLocationChecked(true)
                console.error("Error during initialization:", error);
            }
        };

        initializePage();
    }, []); // Empty dependency array ensures this runs once on component mount

    useEffect(() => {
        const eventSource = new EventSource(routes.SEND_VOTE, { withCredentials: true });
        eventSource.onmessage = (event) => {
            const newTeamId = parseInt(event.data, 10);
            dispatch({ type: "SET_TEAM_ID", payload: newTeamId });
            dispatch({ type: "SET_HAS_VOTED", payload: false });
            newTeamId == -1 ? dispatch({ type: "SET_MODE", payload: "voteIsClosed" }):
                              dispatch({ type: "SET_MODE", payload: "voteIsOpen" });
        };
        eventSource.onerror = () => {
            console.log('Connection lost. Reconnecting...');
            window.location.reload();
        };

        return () => eventSource.close();
    }, []);

    // UI Components
    const VoteOpen = (
        <div className="home-container vote-form-container">
            <h1 className="vote-open-title">
                Your vote for team <span style={{ color: '#790C18' }}>{state.teamId}</span>
            </h1>
            <form
                className="vote-form"
                onSubmit={(event) => voteSubmitHandler(event, state.userVote)}
            >
                <button
                    name="vote-yes"
                    id="vote-yes"
                    type="submit"
                    onClick={() => dispatch({ type: "SET_USER_VOTE", payload: "yes" })}
                    style={{ backgroundColor: '#5F5A66' }}
                >
                    Yes
                </button>
                <button
                    name="vote-no"
                    id="vote-no"
                    type="submit"
                    onClick={() => dispatch({ type: "SET_USER_VOTE", payload: "no" })}
                    style={{ backgroundColor: '#4D4855' }}
                >
                    No
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
    if(locationAllowed === false) return (<div>
    <h1 style={{
        fontSize:'1em',
        textAlign:'center'
    }}>Voting is only available inside the auditorium. Please enter the venue to proceed.</h1>
</div>);
    if (state.mode === "voteIsOpen") return VoteOpen;
    if (state.mode === "thankYouForVoting") return ThankYouForYourVote;
    return VoteClosed;
}
