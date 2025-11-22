import axios from "axios";
import { baseURL, routes } from "./apiRoutes";

const apiClient = axios.create({
  baseURL: baseURL,
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

export const verifyPosition = async (positionData) => {
  try {
    const response = await apiClient.post(routes.VERIFY_POSITION, positionData);
    return { success: true, data: response.data };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.message || "Position verification failed",
    };
  }
};

export const registerUser = async (userData) => {
  try {
    const response = await apiClient.post(routes.REGISTER, { code: userData });
    return { success: true, data: response.data };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.message || "Registration failed",
    };
  }
};

export const sendVote = async (voteData) => {
  try {
    const response = await apiClient.post(routes.SEND_VOTE, voteData);
    return { success: true, data: response.data };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to send vote",
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
