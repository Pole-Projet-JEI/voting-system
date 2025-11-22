const baseURL = `${import.meta.env.VITE_API_URL}`;
/* 
const baseURL = 'http://localhost:3000/api/'; */
const routes = {
  IS_CONNECTED: baseURL + "isconnected",
  VERIFY_POSITION: baseURL + "verifyPosition",
  REGISTER: baseURL + "register",
  SEND_VOTE: baseURL + "sendvote",
  VOTE: baseURL + "vote/:id",
  GET_CURRENT_VOTE: baseURL + "currentteam",
  HAS_VOTED: baseURL + "hasvoted",

  // Admin routes
  ADMIN_TEAMS: baseURL + "admin/teams",
  ADMIN_PRESENTING: baseURL + "admin/presenting",
  ADMIN_TEAM: baseURL + "admin/team",
  ADMIN_TEAM_BY_ID: baseURL + "admin/team/:id",
};

export { baseURL, routes };
