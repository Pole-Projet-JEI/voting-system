import { getGeofenceStatus, voteForId } from "./userApi";
import { getVoterLocation } from "./geolocation";

// Outcome of one attempt:
//   { kind: "saved" }                  vote stored (or already stored earlier)
//   { kind: "retry" }                  server unreachable / server error: keep and retry
//   { kind: "rejected", message, code } definitive refusal shown to the voter
//   { kind: "unauthenticated" }        session expired
//
// Pass geofenceEnabled when already known (loaded with the page): the
// location request then starts right inside the tap on "Submit", which some
// browsers (iPhone Safari) need to show the permission prompt.
export const attemptVote = async (teamId, vote, { onLocating, geofenceEnabled, maxAccuracyMeters } = {}) => {
  const payload = { vote };

  let enabled = geofenceEnabled;
  if (typeof enabled !== "boolean") {
    const geofence = await getGeofenceStatus();
    if (!geofence.success) {
      return { kind: "retry" };
    }
    enabled = geofence.data.enabled === true;
  }

  if (enabled) {
    onLocating?.();
    const position = await getVoterLocation(
      Number.isFinite(maxAccuracyMeters) ? { targetMeters: maxAccuracyMeters } : {}
    );
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
        "Your phone reports that you are outside the venue. Votes are only accepted from inside the room.",
    };
  }

  if (response.errorCode === "LOCATION_INACCURATE") {
    return {
      kind: "rejected",
      code: response.errorCode,
      message: `Your location is not precise enough yet${
        payload.location ? ` (±${Math.round(payload.location.accuracy)} m)` : ""
      }. Make sure precise location is on, wait a few seconds, then tap Submit again.`,
    };
  }

  if (response.errorCode === "LOCATION_STALE") {
    return {
      kind: "rejected",
      code: response.errorCode,
      message: "Your phone gave an old position. Tap Submit again.",
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
