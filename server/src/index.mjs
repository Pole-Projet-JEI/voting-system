import express from "express";
import cors from "cors";
import session from "express-session";
import cookieParser from "cookie-parser";
import dbconfig from "./mongodb/connect.mjs";
import statusRouter from "./check/status.mjs";
import registerRouter from "./register/register.mjs";
import positionRouter from "./check/position.mjs";
import votingRouter from "./vote/voting.mjs";
import sendingVoteRouter from "./vote/send-vote.mjs";
import currentVoteRouter from "./check/prensenting-team.mjs";
import hasVotedRouter from "./check/hasvoted.mjs";
import presentingRouter from "./admin/apis/presenting.mjs";
import visualizationRouter from "./admin/apis/visualization.mjs";
import teamManagementRouter from "./admin/apis/team-management.mjs";
import adminLoginRouter from "./admin/apis/auth/login.mjs";
import adminLogoutRouter from "./admin/apis/auth/logout.mjs";
import dotenv from "dotenv";
import path from "path";
import { seedVoters } from "./seed/seed-voters.mjs";

const __dirname = path.dirname(new URL(import.meta.url).pathname);
dotenv.config();

const NODE_ENV = process.env.NODE_ENV || "development";
const IS_PROD = NODE_ENV === "production";
const IS_STAGING = NODE_ENV === "staging";
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "localhost";
const mongoUri = process.env.MONGO_URI;
const sessionSecret = process.env.SESSION_SECRET;

console.log(` Starting server in ${NODE_ENV} mode`);
console.log(` Host: ${HOST}`);

const getAllowedOrigins = () => {
  if (IS_PROD) {
    return [`https://${HOST}`, `http://${HOST}`];
  } else if (IS_STAGING) {
    return [`http://${HOST}`, `http://${HOST}:80`];
  } else {
    return [
      "http://localhost:80",
      "http://localhost",
      `http://${HOST}:80`,
      `http://${HOST}`,
    ];
  }
};

const corsOptions = {
  origin: getAllowedOrigins(),
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true,
};

const app = express();
app.use(cors(corsOptions));

app.use(express.json());
app.use(cookieParser());
app.use(
  session({
    secret: sessionSecret,
    saveUninitialized: false,
    resave: false,
    cookie: {
      maxAge: 1000 * 60 * 60 * 24,
      secure: IS_PROD,
      httpOnly: true,
      sameSite: IS_PROD || IS_STAGING ? "strict" : "lax",
    },
  })
);

dbconfig(mongoUri);

seedVoters().catch((err) => console.error("Seeding failed:", err));

app.use(statusRouter); // /api/isconnected - checks cookie manually
app.use(registerRouter); // /api/register - public registration
app.use(positionRouter); // /api/verifyPosition - location check
app.use(sendingVoteRouter); // /api/sendvote - SSE stream (public)
app.use(currentVoteRouter); // /api/currentteam - anyone can view

app.use(adminLoginRouter);
app.use(adminLogoutRouter);

// Voter auth routes (middleware applied at router level)
app.use(votingRouter);
app.use(hasVotedRouter);
// Admin routes (middleware applied at router level)
app.use(presentingRouter);
app.use(visualizationRouter);
app.use(teamManagementRouter);
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
