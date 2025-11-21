const baseURL = `${import.meta.env.VITE_API_URL}`;

const routes = {
  IS_CONNECTED: baseURL + "isconnected",
  VERIFY_POSITION: baseURL + "verifyPosition",
  REGISTER: baseURL + "register",
  SEND_VOTE: baseURL + "sendvote",
  VOTE: baseURL + "vote/:id",
  GET_CURRENT_VOTE: baseURL + "currentteam",
  HAS_VOTED: baseURL + "hasvoted",

  ADMIN_LOGIN: baseURL + "admin/login",
  ADMIN_LOGOUT: baseURL + "admin/logout",
  ADMIN_TEAMS: baseURL + "admin/teams",
  ADMIN_PRESENTING: baseURL + "admin/presenting",
  ADMIN_TEAM: baseURL + "admin/team",
  ADMIN_TEAM_BY_ID: baseURL + "admin/team/:id",
};

export { baseURL, routes };
