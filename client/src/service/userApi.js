import axios from "axios";
import { routes } from "./apiRoutes";

const apiClient = axios.create({
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: true,
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
