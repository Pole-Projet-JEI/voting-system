import { Router } from "express";
import {
  createTeam,
  deleteTeam,
  updateTeam,
} from "../services/teamManagementService.mjs";
import { requireAdmin } from "../middleware/requireAdmin.mjs";

const route = Router();

route.use(requireAdmin);

route.post("/api/admin/team", async (req, res) => {
  try {
    const { teamName, description } = req.body;

    if (!teamName || teamName.trim() === "") {
      return res.status(400).json({ message: "Le nom de l'équipe est obligatoire" });
    }

    const newTeam = await createTeam(
      teamName.trim(),
      description?.trim() || ""
    );

    return res.status(201).json({
      success: true,
      message: `Équipe « ${newTeam.teamName} » créée`,
      team: newTeam,
    });
  } catch (error) {
    console.error("Error creating team:", error);

    if (error.code === 11000) {
      return res.status(409).json({
        message: "Une équipe porte déjà ce nom",
      });
    }

    return res.status(500).json({
      message: "Erreur interne du serveur",
    });
  }
});

route.put("/api/admin/team/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { teamName, description } = req.body;

    if (!teamName && !description) {
      return res.status(400).json({
        message:
          "At least one field (teamName or description) must be provided",
      });
    }

    const updates = {};
    if (teamName) updates.teamName = teamName.trim();
    if (description !== undefined) updates.description = description.trim();

    const updatedTeam = await updateTeam(id, updates);

    if (!updatedTeam) {
      return res.status(404).json({ message: "Équipe introuvable" });
    }

    return res.json({
      success: true,
      message: `Équipe « ${updatedTeam.teamName} » modifiée`,
      team: updatedTeam,
    });
  } catch (error) {
    console.error("Error updating team:", error);

    if (error.code === 11000) {
      return res.status(409).json({
        message: "Une équipe porte déjà ce nom",
      });
    }

    return res.status(500).json({
      message: "Erreur interne du serveur",
    });
  }
});

route.delete("/api/admin/team/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const deletedTeam = await deleteTeam(id);

    if (!deletedTeam) {
      return res.status(404).json({ message: "Équipe introuvable" });
    }

    return res.json({
      success: true,
      message: `Équipe « ${deletedTeam.teamName} » supprimée`,
      team: deletedTeam,
    });
  } catch (error) {
    console.error("Error deleting team:", error);

    if (error.message === "Cannot delete team that is currently presenting") {
      return res.status(400).json({ message: "Impossible de supprimer une équipe sur scène" });
    }

    if (error.message === "Cannot delete team that has already presented") {
      return res.status(400).json({ message: "Impossible de supprimer une équipe déjà passée" });
    }

    return res.status(500).json({
      message: "Erreur interne du serveur",
    });
  }
});

export default route;
