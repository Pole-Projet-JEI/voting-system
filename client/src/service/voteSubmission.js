import { getGeofenceStatus, voteForId } from "./userApi";
import { getCurrentLocation } from "./geolocation";

// Outcome of one attempt:
//   { kind: "saved" }                  vote stored (or already stored earlier)
//   { kind: "retry" }                  server unreachable / server error: keep and retry
//   { kind: "rejected", message, code } definitive refusal shown to the voter
//   { kind: "unauthenticated" }        session expired
export const attemptVote = async (teamId, vote, { onLocating } = {}) => {
  const payload = { vote };

  const geofence = await getGeofenceStatus();
  if (!geofence.success) {
    return { kind: "retry" };
  }

  if (geofence.data.enabled) {
    onLocating?.();
    const position = await getCurrentLocation();
    if (!position.success) {
      return { kind: "rejected", message: position.error, code: position.errorCode };
    }
    payload.location = position.location;
  }

  const response = await voteForId(teamId, payload);

  if (response.success) {
    return response.data.voted
      ? { kind: "saved" }
      : { kind: "rejected", message: response.data.message || "Vote not recorded." };
  }

  if (response.networkError || response.status >= 500) {
    return { kind: "retry" };
  }

  if (response.status === 401) {
    return { kind: "unauthenticated" };
  }

  if (/already voted/i.test(response.error || "")) {
    return { kind: "saved" };
  }

  if (response.errorCode === "OUTSIDE_VENUE") {
    return {
      kind: "rejected",
      code: response.errorCode,
      message:
        "Your phone reports that you are outside the venue. Move inside the room, turn on precise location / GPS, and try again.",
    };
  }

  return {
    kind: "rejected",
    code: response.errorCode,
    message: response.error || "Failed to submit vote. Please try again.",
  };
};

// Votes that could not reach the server are kept on the phone and retried.
// Storage can be unavailable (private mode), so every access is guarded.
const PENDING_KEY = "voting.pendingVote";
const VOTED_KEY = "voting.votedTeams";

const read = (key, fallback) => {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

const write = (key, value) => {
  try {
    if (value === null) {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, JSON.stringify(value));
    }
  } catch {
    // Ignore: retry then only lasts while the page stays open.
  }
};

export const getPendingVote = () => read(PENDING_KEY, null);
export const setPendingVote = (pending) => write(PENDING_KEY, pending);

export const rememberVotedTeam = (teamId) => {
  const voted = read(VOTED_KEY, []);
  if (!voted.includes(teamId)) {
    write(VOTED_KEY, [...voted, teamId].slice(-20));
  }
};

export const hasRememberedVote = (teamId) =>
  Boolean(teamId) && read(VOTED_KEY, []).includes(teamId);
