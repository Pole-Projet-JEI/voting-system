import axios from "axios";
import { routes } from "./apiRoutes";

const adminClient = axios.create({
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: true,
});

export const getAllTeams = async () => {
  try {
    const response = await adminClient.get(routes.ADMIN_TEAMS);
    return response.data;
  } catch (error) {
    console.error("Error fetching teams:", error);
    throw error;
  }
};

export const getPresentingTeam = async () => {
  try {
    const response = await adminClient.get(routes.ADMIN_PRESENTING);
    return response.data;
  } catch (error) {
    console.error("Error fetching presenting team:", error);
    throw error;
  }
};

export const setPresentingTeam = async (teamId) => {
  console.log("setPresentingTeam called with teamId:", teamId);
  console.log("Route:", routes.ADMIN_PRESENTING);

  try {
    const response = await adminClient.post(routes.ADMIN_PRESENTING, {
      teamId,
    });
    console.log("Full response:", response);
    console.log("Response data:", response.data);
    return response.data;
  } catch (error) {
    console.error("Error setting presenting team - ERROR CAUGHT:", error);
    console.error("Error response:", error.response);
    console.error("Error message:", error.message);
    throw error;
  }
};

export const stopPresentingTeam = async () => {
  try {
    const response = await adminClient.delete(routes.ADMIN_PRESENTING);
    return response.data;
  } catch (error) {
    console.error("Error stopping presentation:", error);
    throw error;
  }
};

export const createTeam = async (teamName, description = "") => {
  try {
    const response = await adminClient.post(routes.ADMIN_TEAM, {
      teamName,
      description,
    });
    return response.data;
  } catch (error) {
    console.error("Error creating team:", error);
    throw error;
  }
};

export const updateTeam = async (teamId, updates) => {
  try {
    const url = routes.ADMIN_TEAM_BY_ID.replace(":id", teamId);
    const response = await adminClient.put(url, updates);
    return response.data;
  } catch (error) {
    console.error("Error updating team:", error);
    throw error;
  }
};

export const deleteTeam = async (teamId) => {
  try {
    const url = routes.ADMIN_TEAM_BY_ID.replace(":id", teamId);
    const response = await adminClient.delete(url);
    return response.data;
  } catch (error) {
    console.error("Error deleting team:", error);
    throw error;
  }
};
