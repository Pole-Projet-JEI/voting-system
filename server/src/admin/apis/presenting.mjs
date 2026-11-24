import { Router } from "express";
import {
  changePresentingTeam,
  getCurrentPresentingTeam,
  startVoting,
  stopPresenting,
} from "../services/presentingService.mjs";
import { requireAdmin } from "../middleware/requireAdmin.mjs";

const route = Router();

route.post("/api/admin/presenting", requireAdmin, async (req, res) => {
  try {
    const { teamId } = req.body;

    if (!teamId) {
      return res.status(400).json({ message: "L'identifiant de l'équipe est obligatoire" });
    }

    const result = await changePresentingTeam(teamId);

    if (result.error) {
      if (result.error.includes("not found")) {
        return res.status(404).json({ message: "Équipe introuvable" });
      }
      if (result.error.includes("already presented")) {
        return res.status(400).json({ message: "Cette équipe est déjà passée" });
      }
      if (result.error.includes("Another team is currently presenting")) {
        return res.status(400).json({ message: "Une autre équipe est déjà sur scène" });
      }
      return res.status(500).json({ message: "Impossible de changer l'équipe sur scène" });
    }

    return res.json({
      success: true,
      message: `L'équipe « ${result.teamName} » est sur scène`,
      team: result,
    });
  } catch (error) {
    console.error("Error changing presenting team:", error);
    return res.status(500).json({
      message: "Erreur interne du serveur",
    });
  }
});

route.get("/api/admin/presenting", requireAdmin, async (req, res) => {
  try {
    const presentingTeam = await getCurrentPresentingTeam();

    if (!presentingTeam) {
      return res.json({
        presenting: false,
        team: null,
      });
    }

    return res.json({
      presenting: true,
      team: presentingTeam,
    });
  } catch (error) {
    console.error("Error getting presenting team:", error);
    return res.status(500).json({
      message: "Erreur interne du serveur",
    });
  }
});

route.post("/api/admin/presenting/voting", requireAdmin, async (req, res) => {
  try {
    const team = await startVoting();

    if (!team) {
      return res.status(400).json({
        message: "Aucune équipe ne présente en ce moment",
      });
    }

    return res.json({
      success: true,
      message: `Le vote est ouvert pour « ${team.teamName} »`,
      team,
    });
  } catch (error) {
    console.error("Error starting voting:", error);
    return res.status(500).json({ message: "Erreur interne du serveur" });
  }
});

route.delete("/api/admin/presenting", requireAdmin, async (req, res) => {
  try {
    const previousTeam = await stopPresenting();

    if (!previousTeam) {
      return res.json({
        message: "Aucune équipe n'était sur scène",
      });
    }

    return res.json({
      success: true,
      message: `L'équipe « ${previousTeam.teamName} » n'est plus sur scène`,
      team: previousTeam,
    });
  } catch (error) {
    console.error("Error stopping presentation:", error);
    return res.status(500).json({
      message: "Erreur interne du serveur",
    });
  }
});

export default route;
