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
import currentVoteRouter from "./check/currentvote.mjs";
import hasVotedRouter from "./check/hasvoted.mjs";
import dotenv from "dotenv";
import Voter from "./mongodb/voterSchema.mjs";
import fs from "fs";
import { Parser } from "json2csv";
import path from "path";
import { seedVoters } from "./seed/seedVoters.mjs";

const corsOptions = {
  origin: [
    "https://voting.jeinsat.com",
    "http://localhost:80",
    "http://localhost",
  ], // Adjust the URL to your React container's URL
  methods: ["GET", "POST", "PUT", "DELETE"], // Allow the necessary HTTP methods
  credentials: true, // Allows cookies to be sent between frontend and backend
};

const __dirname = path.dirname(new URL(import.meta.url).pathname);

dotenv.config();
// Use environment variables
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

// Routers
app.use(statusRouter);
app.use(registerRouter);
app.use(positionRouter);
app.use(votingRouter);
app.use(sendingVoteRouter);
app.use(currentVoteRouter);
app.use(hasVotedRouter);

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
