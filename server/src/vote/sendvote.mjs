import { Router } from "express";
import CurrentVote from "../mongodb/currentVoteSchema.mjs";

const route = Router();


route.get("/api/sendvote", async (req, res) => {
  try {
      // Set headers for SSE (Server-Sent Events)
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");  // Disable buffering for SSE

      // Watch for changes in the CurrentVote collection
      const changeStream = CurrentVote.watch([], { fullDocument: "updateLookup" });

      // Handle change events from MongoDB
      changeStream.on("change", async (change) => {
          try {
              if (change.updateDescription.updatedFields.teamID) {
                  const teamID = change.fullDocument.teamID;

                  // If the teamID is valid (not -1), send it as SSE data
                  if (teamID !== -1) {
                      res.write(`data: ${teamID}\n\n`);
                  }
                  // If the teamID is -1, send a specific value
                  else {
                      res.write(`data: ${-1}\n\n`);
                  }
              }
          } catch (error) {
              console.error("Error processing change event:", error);
              // You can add additional handling here if necessary (e.g., close the connection, send error message)
              res.write(`data: {"error": "Error processing change event"}\n\n`);
          }
      });

      // Handle client disconnect
      req.on("close", () => {
          console.log("Client disconnected, closing change stream.");
          changeStream.close();  // Close the change stream when the client disconnects
          res.end();              // End the response
      });

  } catch (error) {
      console.error("Error in /api/sendvote:", error);
      return res.status(500).json({ message: "Internal Server Error", error: error.message });
  }
});

export default route;