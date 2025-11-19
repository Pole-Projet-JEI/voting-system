import { Router } from "express";

const route = Router();
const changeStream = CurrentVote.watch([], {
  fullDocument: "updateLookup",
});

const voters = new Map();
route.get("/api/sendvote", async (req, res) => {
  try {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    // Watch for changes in the CurrentVote collection
    //const voterId = Date.now() + Math;
    changeStream.on("change", async (change) => {
      try {
        console.log("------");

        console.log("THE CHANGE stream\n", change);
        console.log("------");
        if (change.updateDescription.updatedFields.teamID) {
          const teamID = change.fullDocument.teamID;
          if (teamID !== -1) {
            res.write(`data: ${teamID}\n\n`);
          } else {
            res.write(`data: ${-1}\n\n`);
          }
        }
      } catch (error) {
        console.error("Error processing change event:", error);
        res.write(`data: {"error": "Error processing change event"}\n\n`);
      }
    });

    req.on("close", () => {
      console.log("Client disconnected, closing change stream.");
      res.end(); // we close the SSE
    });
  } catch (error) {
    console.error("Error in /api/sendvote:", error);
    return res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
});

export default route;
