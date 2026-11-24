import { Router } from "express";
import { requireAdmin } from "../middleware/requireAdmin.mjs";
import { getOfficialResults } from "../services/officialResultsService.mjs";

const route = Router();

route.get("/api/admin/results", requireAdmin, async (req, res) => {
  try {
    return res.json(await getOfficialResults());
  } catch (error) {
    console.error("Error computing official results:", error);
    return res.status(500).json({ message: "Erreur interne du serveur" });
  }
});

export default route;
