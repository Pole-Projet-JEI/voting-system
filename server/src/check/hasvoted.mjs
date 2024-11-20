import { Router } from "express";
import CurrentVote from "../mongodb/currentVoteSchema.mjs";
import Voter from "../mongodb/voterSchema.mjs";

const route = Router();

route.get("/api/hasvoted", async (req, res) => {
    try {
        // Get the current team ID from the database
        const team = await CurrentVote.find();
        if (team.length === 0) {
            return res.status(404).json({ message: "No teams found" });
        }
        const currentTeamID = team[0].teamID;

        // Get the code from cookies
        const code = req.cookies.connectionCookie?.code;

        // If code exists, check if the user has already voted
        if (code) {
            const user = await Voter.findOne({ code: code });

            // Check if the user has voted for the current team
            if (!user) {
                return res.status(201).json({ message: "User not found" });
            }

            const hasVoted = user.votes.includes(currentTeamID); // Check if the teamID exists in the user's votes

            return res.status(200).json({ hasVoted: hasVoted });
        } else {
            return res.sendStatus(200); // If no code in cookies, return status 200
        }
    } catch (error) {
        console.error("Error in /api/hasvoted:", error); // Log the error for debugging
        return res.status(500).json({ message: "Internal Server Error", error: error.message });
    }
});

export default route;
