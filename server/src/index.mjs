import "dotenv/config";
import { randomUUID } from "node:crypto";
import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import cookieParser from "cookie-parser";
import dbconfig from "./mongodb/connect.mjs";
import statusRouter from "./check/status.mjs";
import registerRouter from "./register/register.mjs";
import votingRouter from "./vote/voting.mjs";
import sendingVoteRouter, {
  initializeChangeStream,
  shutdownChangeStream,
  shutdownSseClients,
} from "./vote/send-vote.mjs";
import currentVoteRouter from "./check/prensenting-team.mjs";
import hasVotedRouter from "./check/hasvoted.mjs";
import geofenceRouter from "./geofence/geofence-api.mjs";
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
import { createCorsOptions } from "./config/cors.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config();

const NODE_ENV = process.env.NODE_ENV || "development";
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "localhost";
const mongoUri = process.env.MONGO_URI;
const sessionSecret = process.env.SESSION_SECRET;

console.log(`Starting server in ${NODE_ENV} mode`);
console.log(` Host: ${HOST}`);
if (process.env.VOTING_TRANSACTION_DIAGNOSTICS === "true") {
  console.log(JSON.stringify({
    event: "performance_source_revision",
    sourceRevision: process.env.EXPECTED_SOURCE_REVISION || "unknown",
  }));
}

const corsOptions = createCorsOptions({ nodeEnv: NODE_ENV });

const app = express();
app.use(cors(corsOptions));

app.use(express.json());
app.use((req, res, next) => {
  const requestId = randomUUID();
  const startedAt = Date.now();
  let logged = false;

  req.requestId = requestId;
  res.setHeader("X-Request-ID", requestId);

  const logRequest = (completion) => {
    if (logged) {
      return;
    }

    logged = true;
    console.log(
      JSON.stringify({
        event: "http_request",
        requestId,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        durationMs: Date.now() - startedAt,
        completion,
      })
    );
  };

  res.once("finish", () => logRequest("finish"));
  res.once("close", () => logRequest("close"));
  next();
});

if (!sessionSecret) {
  throw new Error("SESSION_SECRET must be configured");
}
app.use(cookieParser(sessionSecret));

await dbconfig(mongoUri);
await ensureBootstrapAdmin();
await seedVoters();
initializeChangeStream();

app.use(statusRouter); // /api/isconnected - checks cookie manually
app.use(registerRouter); // /api/register - public registration
app.use(sendingVoteRouter); // /api/sendvote - SSE stream (public)
app.use(currentVoteRouter); // /api/currentteam - anyone can view
app.use(geofenceRouter); // /api/geofence (public) + /api/admin/geofence (admin)

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

  shutdownSseClients();
  await shutdownChangeStream();
  await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
};

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    shutdown(signal).catch((error) => {
      console.error("Shutdown failed:", error.message || error);
      process.exitCode = 1;
    });
  });
}
