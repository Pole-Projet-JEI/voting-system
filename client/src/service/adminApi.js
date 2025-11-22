import axios from "axios";
import { routes } from "./apiRoutes";

const adminClient = axios.create({
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: true,
});

export const checkAdminAuth = async () => {
  try {
    const response = await adminClient.get(routes.ADMIN_AUTH);
    return { success: true, data: response.data };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.message || "Authentication check failed",
    };
  }
};

export const adminLogin = async (secretKey) => {
  try {
    const response = await adminClient.post(routes.ADMIN_LOGIN, { secretKey });
    return { success: true, data: response.data };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.message || "Login failed",
    };
  }
};

export const adminLogout = async () => {
  try {
    const response = await adminClient.post(routes.ADMIN_LOGOUT);
    return { success: true, data: response.data };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.message || "Logout failed",
    };
  }
};

export const getAllTeams = async () => {
  try {
    const response = await adminClient.get(routes.ADMIN_TEAMS);
    return { success: true, data: response.data };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to fetch teams",
    };
  }
};

export const getPresentingTeam = async () => {
  try {
    const response = await adminClient.get(routes.ADMIN_PRESENTING);
    return { success: true, data: response.data };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to fetch presenting team",
    };
  }
};

export const setPresentingTeam = async (teamId) => {
  try {
    const response = await adminClient.post(routes.ADMIN_PRESENTING, {
      teamId,
    });
    return { success: true, data: response.data };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to set presenting team",
    };
  }
};

export const stopPresentingTeam = async () => {
  try {
    const response = await adminClient.delete(routes.ADMIN_PRESENTING);
    return { success: true, data: response.data };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to stop presentation",
    };
  }
};

export const createTeam = async (teamName, description = "") => {
  try {
    const response = await adminClient.post(routes.ADMIN_TEAM, {
      teamName,
      description,
    });
    return { success: true, data: response.data };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to create team",
    };
  }
};

export const updateTeam = async (teamId, updates) => {
  try {
    const url = routes.ADMIN_TEAM_BY_ID.replace(":id", teamId);
    const response = await adminClient.put(url, updates);
    return { success: true, data: response.data };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to update team",
    };
  }
};

export const deleteTeam = async (teamId) => {
  try {
    const url = routes.ADMIN_TEAM_BY_ID.replace(":id", teamId);
    const response = await adminClient.delete(url);
    return { success: true, data: response.data };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to delete team",
    };
  }
};
