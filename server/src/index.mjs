import express from "express";
import cors from "cors";
import session from "express-session";
import cookieParser from "cookie-parser";
import dbconfig from "./mongodb/connect.mjs";
import statusRouter from "./check/status.mjs";
import registerRouter from "./register/register.mjs";
import positionRouter from "./check/position.mjs";
import votingRouter from "./vote/voting.mjs";
import sendingVoteRouter from "./vote/sendvote.mjs";
import currentVoteRouter from "./check/prensentingteam.mjs";
import hasVotedRouter from "./check/hasvoted.mjs";
import dotenv from "dotenv";
import path from "path";
import { seedVoters } from "./seed/seedVoters.mjs";
import { requireAuth } from "./middleware/auth-cookie.mjs";

const corsOptions = {
  origin: [
    "https://voting.jeinsat.com",
    "http://localhost:80",
    "http://localhost",
  ],
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true, // Allows cookies to be sent between frontend and backend
};

const __dirname = path.dirname(new URL(import.meta.url).pathname);

dotenv.config();
const PORT = process.env.PORT || 3000;
const mongoUri = process.env.MONGO_URI;
const sessionSecret = process.env.SESSION_SECRET;

const app = express();
app.use(cors(corsOptions));

app.use(express.json());
app.use(cookieParser());
app.use(
  session({
    secret: `${sessionSecret}`,
    saveUninitialized: false,
    resave: false,
    cookie: {
      maxAge: 1000 * 60 * 60 * 24,
      secure: false,
    },
  })
);

dbconfig(mongoUri);

// Seed database on startup if empty
seedVoters().catch((err) => console.error("Seeding failed:", err));

app.use(statusRouter); // /api/isconnected - checks cookie manually
app.use(registerRouter); // /api/register - public registration
app.use(positionRouter); // /api/verifyPosition - location check
app.use(sendingVoteRouter); // /api/sendvote - SSE stream (public)
app.use(currentVoteRouter); // /api/currentteam - anyone can view

// Protected routes (authentication required)
app.use(requireAuth, votingRouter); // /api/vote/:id - requires auth
app.use(requireAuth, hasVotedRouter); // /api/hasvoted - requires auth

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
