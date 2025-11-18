import { Router } from "express";
import CurrentVote from "../mongodb/currentVoteSchema.mjs";
import Team from "../mongodb/teamSchema.mjs";
import Voter from "../mongodb/voterSchema.mjs";

const route = Router();

route.post("/api/vote/:id", async (req, res) => {
  
});

export default route;
