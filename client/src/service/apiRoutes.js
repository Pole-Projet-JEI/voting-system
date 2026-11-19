const configuredBaseURL = import.meta.env.VITE_API_URL || "/api/";
const baseURL = `${configuredBaseURL.replace(/\/+$/, "")}/`;

const routes = {
  IS_CONNECTED: baseURL + "isconnected",
  REGISTER: baseURL + "register",
  JOIN: baseURL + "join",
  LOGIN_STATUS: baseURL + "login/status",
  SEND_VOTE: baseURL + "sendvote",
  VOTE: baseURL + "vote/:id",
  GET_CURRENT_VOTE: baseURL + "currentteam",
  HAS_VOTED: baseURL + "hasvoted",
  GEOFENCE: baseURL + "geofence",


  // Admin routes
  ADMIN_AUTH: baseURL + "admin/auth",

  ADMIN_LOGIN: baseURL + "admin/login",
  ADMIN_LOGOUT: baseURL + "admin/logout",
  ADMIN_PASSWORD: baseURL + "admin/password",
  ADMIN_TEAMS: baseURL + "admin/teams",
  ADMIN_PRESENTING: baseURL + "admin/presenting",
  ADMIN_START_VOTING: baseURL + "admin/presenting/voting",
  ADMIN_TEAM: baseURL + "admin/team",
  ADMIN_TEAM_BY_ID: baseURL + "admin/team/:id",
  ADMIN_GEOFENCE: baseURL + "admin/geofence",
  ADMIN_RESULTS: baseURL + "admin/results",
  ADMIN_SEND_VOTE: baseURL + "admin/sendvote",
  ADMIN_VOTERS_SUMMARY: baseURL + "admin/voters/summary",
  ADMIN_LOGIN_WINDOW: baseURL + "admin/login-window",
};

export { baseURL, routes };
