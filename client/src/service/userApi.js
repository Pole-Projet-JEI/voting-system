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
    return response.data;
  } catch (error) {
    console.error("Error in checkConnection:", error);
    throw error;
  }
};

export const verifyPosition = async (positionData) => {
  try {
    const response = await apiClient.post(routes.VERIFY_POSITION, positionData);
    return response.data;
  } catch (error) {
    console.error("Error in verifyPosition:", error);
    throw error;
  }
};

export const registerUser = async (userData) => {
  try {
    const response = await apiClient.post(routes.REGISTER, { code: userData });
    return response.data;
  } catch (error) {
    console.error("Error in registerUser:", error);
    throw error;
  }
};

export const sendVote = async (voteData) => {
  try {
    const response = await apiClient.post(routes.SEND_VOTE, voteData);
    return response.data;
  } catch (error) {
    console.error("Error in sendVote:", error);
    throw error;
  }
};

export const voteForId = async (id, voteData) => {
  try {
    const url = routes.VOTE.replace(":id", id);
    const response = await apiClient.post(url, voteData);
    return response.data;
  } catch (error) {
    console.error(`Error voting for ID ${id}:`, error);
    throw error;
  }
};

export const getCurrentTeam = async () => {
  try {
    const response = await apiClient.get(routes.GET_CURRENT_VOTE);
    return response.data;
  } catch (error) {
    console.error("Error getting team id", error);
    throw error;
  }
};

export const didUserVote = async () => {
  try {
    const response = await apiClient.get(routes.HAS_VOTED);
    return response.data;
  } catch (error) {
    console.error("Error fetching has voted value", error);
    throw error;
  }
};
