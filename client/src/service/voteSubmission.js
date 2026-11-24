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
      : { kind: "rejected", message: response.data.message || "Vote non enregistré." };
  }

  if (response.networkError || response.status >= 500) {
    return { kind: "retry" };
  }

  if (response.status === 401) {
    return { kind: "unauthenticated" };
  }

  if (/already voted|déjà voté/i.test(response.error || "")) {
    return { kind: "saved" };
  }

  if (response.errorCode === "OUTSIDE_VENUE") {
    return {
      kind: "rejected",
      code: response.errorCode,
      message:
        "Votre téléphone indique que vous êtes hors de la salle. Les votes ne sont acceptés que depuis la salle.",
    };
  }

  if (response.errorCode === "LOCATION_INACCURATE") {
    return {
      kind: "rejected",
      code: response.errorCode,
      message: `Votre position n'est pas encore assez précise${
        payload.location ? ` (±${Math.round(payload.location.accuracy)} m)` : ""
      }. Vérifiez que la position exacte est activée, attendez quelques secondes, puis renvoyez votre vote.`,
    };
  }

  if (response.errorCode === "LOCATION_STALE") {
    return {
      kind: "rejected",
      code: response.errorCode,
      message: "Votre téléphone a donné une ancienne position. Renvoyez votre vote.",
    };
  }

  return {
    kind: "rejected",
    code: response.errorCode,
    message: response.error || "Échec de l'envoi du vote. Réessayez.",
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
