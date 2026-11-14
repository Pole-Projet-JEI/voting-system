import "dotenv/config";
import express from "express";
import cors from "cors";
import session from "express-session";
import cookieParser from "cookie-parser";
import dbconfig from "./mongodb/connect.mjs";
import statusRouter from "./check/status.mjs";
import registerRouter from "./register/register.mjs";
import positionRouter from "./check/position.mjs";
import votingRouter from "./vote/voting.mjs";
import sendingVoteRouter, {
  initializeChangeStream,
  shutdownChangeStream,
} from "./vote/send-vote.mjs";
import currentVoteRouter from "./check/prensenting-team.mjs";
import hasVotedRouter from "./check/hasvoted.mjs";
import presentingRouter from "./admin/apis/presenting.mjs";
import visualizationRouter from "./admin/apis/visualization.mjs";
import teamManagementRouter from "./admin/apis/team-management.mjs";
import adminLoginRouter from "./admin/apis/auth/login.mjs";
import adminLogoutRouter from "./admin/apis/auth/logout.mjs";
import adminChangePasswordRouter from "./admin/apis/auth/change-password.mjs";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { seedVoters } from "./seed/seed-voters.mjs";
import { ensureBootstrapAdmin } from "./admin/services/adminBootstrap.mjs";
import { shouldUseSecureCookies } from "./config/cookies.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });
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

// Simple CORS - allow all origins for now
const corsOptions = {
  origin: true, // Allow all origins
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
};

const app = express();
app.use(cors(corsOptions));

app.use(express.json());
if (!sessionSecret) {
  throw new Error("SESSION_SECRET must be configured");
}
app.use(cookieParser(sessionSecret));
app.use(
  session({
    secret: sessionSecret,
    saveUninitialized: false,
    resave: false,
    cookie: {
      maxAge: 1000 * 60 * 60 * 24,
      secure: shouldUseSecureCookies(),
      httpOnly: true,
      sameSite: IS_PROD || IS_STAGING ? "strict" : "lax",
    },
  })
);

await dbconfig(mongoUri);
await ensureBootstrapAdmin();
await seedVoters();
initializeChangeStream();

app.use(statusRouter); // /api/isconnected - checks cookie manually
app.use(registerRouter); // /api/register - public registration
app.use(positionRouter); // /api/verifyPosition - location check
app.use(sendingVoteRouter); // /api/sendvote - SSE stream (public)
app.use(currentVoteRouter); // /api/currentteam - anyone can view

app.use(adminLoginRouter);
app.use(adminLogoutRouter);
app.use(adminChangePasswordRouter);


// Voter auth routes (middleware applied at router level)
app.use(votingRouter);
app.use(hasVotedRouter);
// Admin routes (middleware applied at router level)
app.use(presentingRouter);
app.use(visualizationRouter);
app.use(teamManagementRouter);

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on http://0.0.0.0:${PORT}`);

});

let isShuttingDown = false;
const shutdown = async (signal) => {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;
  console.log(`Received ${signal}; shutting down`);

  await shutdownChangeStream();
  await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
};

process.once("SIGINT", () => {
  shutdown("SIGINT").catch((error) => {
    console.error("Shutdown failed:", error.message || error);
    process.exitCode = 1;
  });
});
process.once("SIGTERM", () => {
  shutdown("SIGTERM").catch((error) => {
    console.error("Shutdown failed:", error.message || error);
    process.exitCode = 1;
  });
});
