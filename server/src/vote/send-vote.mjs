import { Router } from "express";
import Team from "../mongodb/teamSchema.mjs";

const route = Router();

const changeStream = Team.watch(
  [
    {
      $match: {
        "updateDescription.updatedFields.presenting": { $exists: true },
      },
    },
  ],
  {
    fullDocument: "updateLookup",
  }
);

const clients = new Set();

// Listen to change stream once and broadcast to all clients
changeStream.on("change", async (change) => {
  try {
    console.log("added someone")
    let data;
    // If a team's presenting status changed to true, send the team info
    if (change.fullDocument?.presenting === true) {
      data = JSON.stringify({
        teamID: change.fullDocument._id,
        teamName: change.fullDocument.teamName,
        description: change.fullDocument.description,
      });
    }
    // If presenting changed to false (stopped presenting)
    else if (change.fullDocument?.presenting === false) {
      data = JSON.stringify({ teamID: null, teamName: null, stopped: true });
    }

    // Broadcast to all connected clients
    if (data) {
      clients.forEach((client) => {
        try {
          client.write(`data: ${data}\n\n`);
        } catch (err) {
          console.error("Error writing to client:", err);
          clients.delete(client);
        }
      });
    }
  } catch (error) {
    console.error("Error processing change event:", error);
  }
});

route.get("/api/sendvote", async (req, res) => {
  try {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    clients.add(res);
    console.log(`Client connected. Total clients: ${clients.size}`);

    // Send initial connection confirmation
    res.write(`data: ${JSON.stringify({ connected: true })}\n\n`);

    // Remove client when disconnected
    req.on("close", () => {
      clients.delete(res);
      console.log(`Client disconnected. Total clients: ${clients.size}`);
      res.end();
    });
  } catch (error) {
    console.error("Error in /api/sendvote:", error);
    return res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
});

export default route;
