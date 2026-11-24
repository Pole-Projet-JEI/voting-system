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
      error: error.response?.data?.message || "Échec de la vérification de connexion",
    };
  }
};

export const adminLogin = async (secretKey, username = "") => {
  try {
    const response = await adminClient.post(routes.ADMIN_LOGIN, {
      username,
      secretKey,
    });
    return { success: true, data: response.data };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.message || "Échec de la connexion",
      retryAfterSeconds: Number(error.response?.data?.retryAfterSeconds || 0),
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
      error: error.response?.data?.message || "Échec de la déconnexion",
    };
  }
};

export const changeAdminPassword = async (currentPassword, newPassword) => {
  try {
    const response = await adminClient.post(routes.ADMIN_PASSWORD, {
      currentPassword,
      newPassword,
    });
    return { success: true, data: response.data };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.message || "Échec du changement de mot de passe",
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
      error: error.response?.data?.message || "Impossible de charger les équipes",
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
      error: error.response?.data?.message || "Impossible de charger l'équipe sur scène",
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
      error: error.response?.data?.message || "Impossible de mettre l'équipe sur scène",
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
      error: error.response?.data?.message || "Impossible d'arrêter la présentation",
    };
  }
};

export const startVoting = async () => {
  try {
    const response = await adminClient.post(routes.ADMIN_START_VOTING);
    return { success: true, data: response.data };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.message || "Impossible d'ouvrir le vote",
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
      error: error.response?.data?.message || "Impossible de créer l'équipe",
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
      error: error.response?.data?.message || "Impossible de modifier l'équipe",
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
      error: error.response?.data?.message || "Impossible de supprimer l'équipe",
    };
  }
};

export const getGeofenceSettings = async () => {
  try {
    const response = await adminClient.get(routes.ADMIN_GEOFENCE);
    return { success: true, data: response.data };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.message || "Impossible de charger les réglages de position",
    };
  }
};

export const updateGeofenceSettings = async (settings) => {
  try {
    const response = await adminClient.put(routes.ADMIN_GEOFENCE, settings);
    return { success: true, data: response.data };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.message || "Impossible d'enregistrer les réglages de position",
    };
  }
};

export const getOfficialResults = async () => {
  try {
    const response = await adminClient.get(routes.ADMIN_RESULTS);
    return { success: true, data: response.data };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.message || "Impossible de charger les résultats",
    };
  }
};

export const getVotersSummary = async () => {
  try {
    const response = await adminClient.get(routes.ADMIN_VOTERS_SUMMARY);
    return { success: true, data: response.data };
  } catch (error) {
    return { success: false, error: error.response?.data?.message || "Impossible de charger les votants" };
  }
};

export const getAccessQr = async () => {
  try {
    const response = await adminClient.get(routes.ADMIN_ACCESS_QR);
    return { success: true, data: response.data };
  } catch (error) {
    return { success: false, error: error.response?.data?.message || "Impossible de charger le QR code" };
  }
};

export const getVoters = async () => {
  try {
    const response = await adminClient.get(routes.ADMIN_VOTERS);
    return { success: true, data: response.data };
  } catch (error) {
    return { success: false, error: error.response?.data?.message || "Impossible de charger les votants" };
  }
};

const raffleCall = async (method, url) => {
  try {
    const response = await adminClient.request({ method, url });
    return { success: true, data: response.data };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.message || "Impossible de joindre le tirage",
      errorCode: error.response?.data?.code,
    };
  }
};

export const getRaffle = () => raffleCall("get", routes.ADMIN_RAFFLE);
export const drawRaffle = () => raffleCall("post", routes.ADMIN_RAFFLE_DRAW);
export const resetRaffle = () => raffleCall("delete", routes.ADMIN_RAFFLE);

export const setLoginWindow = async (open) => {
  try {
    const response = await adminClient.put(routes.ADMIN_LOGIN_WINDOW, { open });
    return { success: true, data: response.data };
  } catch (error) {
    return { success: false, error: error.response?.data?.message || "Impossible de modifier la connexion" };
  }
};
