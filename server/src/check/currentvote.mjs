import { Router } from "express";
import CurrentVote from "../mongodb/currentVoteSchema.mjs";

const route = Router();


route.get("/api/currentteam", async (req, res) => {
    try {
        // Fetch the current team from the database
        const team = await CurrentVote.find();

        // If no teams are found, return a 404 error
        if (team.length === 0) {
            return res.status(404).json({ message: "No teams found" });
        }

        // Get the teamID from the first team object
        const id = team[0].teamID;

        // Respond with the current teamID
        return res.status(200).json({ teamID: id });
    } catch (error) {
        // Log any errors and send a 500 response
        console.error("Error in /api/currentteam:", error);
        return res.status(500).json({ message: "Internal Server Error", error: error.message });
    }
});

export default route;