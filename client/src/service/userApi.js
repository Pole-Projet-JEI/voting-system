import axios from "axios";
import { routes } from "./apiRoutes";

// Voter requests give up after 8 s so a stalled server never leaves a voter
// stuck on "Submitting...": the vote is then kept on the phone and retried.
export const VOTER_REQUEST_TIMEOUT_MS = 8000;

const apiClient = axios.create({
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: true,
  timeout: VOTER_REQUEST_TIMEOUT_MS,
});

export const checkConnection = async () => {
  try {
    const response = await apiClient.get(routes.IS_CONNECTED);
    return { success: true, data: response.data };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.message || "Échec de la vérification de connexion",
    };
  }
};

export const registerUser = async (userData) => {
  try {
    const response = await apiClient.post(routes.REGISTER, { code: userData });
    
    // Check the status field in the response body
    if (response.data.status === "succeeded") {
      return { success: true, data: response.data };
    } else {
      return {
        success: false,
        error: response.data.message || "Code invalide",
      };
    }
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.message || "Échec de l'inscription",
      networkError: !error.response,
      retryAfterSeconds: Number(error.response?.data?.retryAfterSeconds || 0),
    };
  }
};

export const voteForId = async (id, voteData) => {
  try {
    const url = routes.VOTE.replace(":id", id);
    const response = await apiClient.post(url, voteData);
    return { success: true, data: response.data };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.message || `Échec du vote pour l'équipe ${id}`,
      errorCode: error.response?.data?.code,
      status: error.response?.status,
      networkError: !error.response,
    };
  }
};

export const getCurrentTeam = async () => {
  try {
    const response = await apiClient.get(routes.GET_CURRENT_VOTE);
    return { success: true, data: response.data };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.message || "Impossible de charger l'équipe en cours",
    };
  }
};

export const didUserVote = async () => {
  try {
    const response = await apiClient.get(routes.HAS_VOTED);
    return { success: true, data: response.data };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.message || "Impossible de vérifier votre vote",
    };
  }
};

export const getGeofenceStatus = async () => {
  try {
    const response = await apiClient.get(routes.GEOFENCE);
    return { success: true, data: response.data };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.message || "Impossible de charger les réglages de position",
    };
  }
};

const toFailure = (error, fallback) => ({
  success: false,
  error: error.response?.data?.message || fallback,
  errorCode: error.response?.data?.code,
  networkError: !error.response,
  retryAfterSeconds: Number(error.response?.data?.retryAfterSeconds || 0),
});

// qr-email mode: send the token from the scanned QR code.
export const scanQr = async (token) => {
  try {
    const response = await apiClient.post(routes.JOIN_SCAN, { t: token });
    return { success: true, data: response.data };
  } catch (error) {
    return toFailure(error, "Impossible de vérifier le QR code");
  }
};

export const getLoginStatus = async () => {
  try {
    const response = await apiClient.get(routes.LOGIN_STATUS);
    return { success: true, data: response.data };
  } catch (error) {
    return toFailure(error, "Impossible de vérifier l'état de la connexion");
  }
};

// Opening the voting link: get (or keep) an anonymous voter session cookie.
// body: {} in link mode, { email } in qr-email mode.
export const joinVoting = async (body = {}) => {
  try {
    const response = await apiClient.post(routes.JOIN, body);
    return { success: true, data: response.data };
  } catch (error) {
    return toFailure(error, "Impossible de rejoindre le vote");
  }
};
