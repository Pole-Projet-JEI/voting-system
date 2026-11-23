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
      error: error.response?.data?.message || "Connection check failed",
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
        error: response.data.message || "Invalid code",
      };
    }
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.message || "Registration failed",
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
      error: error.response?.data?.message || `Failed to vote for ID ${id}`,
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
      error: error.response?.data?.message || "Failed to get current team",
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
      error: error.response?.data?.message || "Failed to check vote status",
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
      error: error.response?.data?.message || "Failed to load location settings",
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
    return toFailure(error, "Could not check the QR code");
  }
};

export const getLoginStatus = async () => {
  try {
    const response = await apiClient.get(routes.LOGIN_STATUS);
    return { success: true, data: response.data };
  } catch (error) {
    return toFailure(error, "Could not check login status");
  }
};

// Opening the voting link: get (or keep) an anonymous voter session cookie.
// body: {} in link mode, { email } in qr-email mode.
export const joinVoting = async (body = {}) => {
  try {
    const response = await apiClient.post(routes.JOIN, body);
    return { success: true, data: response.data };
  } catch (error) {
    return toFailure(error, "Could not join");
  }
};
