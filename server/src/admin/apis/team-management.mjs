import { Router } from "express";
import {
  createTeam,
  deleteTeam,
  updateTeam,
} from "../services/teamManagementService.mjs";

const route = Router();

/**
 * Create a new team
 * POST /api/admin/team
 * Body: { teamName: string, description?: string }
 */
route.post("/api/admin/team", async (req, res) => {
  try {
    const { teamName, description } = req.body;

    if (!teamName || teamName.trim() === "") {
      return res.status(400).json({ message: "Team name is required" });
    }

    const newTeam = await createTeam(
      teamName.trim(),
      description?.trim() || ""
    );

    return res.status(201).json({
      success: true,
      message: `Team "${newTeam.teamName}" created successfully`,
      team: newTeam,
    });
  } catch (error) {
    console.error("Error creating team:", error);

    if (error.code === 11000) {
      return res.status(409).json({
        message: "A team with this name already exists",
      });
    }

    return res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
  }
});

/**
 * Update a team
 * PUT /api/admin/team/:id
 * Body: { teamName?: string, description?: string }
 */
route.put("/api/admin/team/:id", async (req, res) => {
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
      return res.status(404).json({ message: "Team not found" });
    }

    return res.json({
      success: true,
      message: `Team "${updatedTeam.teamName}" updated successfully`,
      team: updatedTeam,
    });
  } catch (error) {
    console.error("Error updating team:", error);

    if (error.code === 11000) {
      return res.status(409).json({
        message: "A team with this name already exists",
      });
    }

    return res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
  }
});

/**
 * Delete a team
 * DELETE /api/admin/team/:id
 */
route.delete("/api/admin/team/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const deletedTeam = await deleteTeam(id);

    if (!deletedTeam) {
      return res.status(404).json({ message: "Team not found" });
    }

    return res.json({
      success: true,
      message: `Team "${deletedTeam.teamName}" deleted successfully`,
      team: deletedTeam,
    });
  } catch (error) {
    console.error("Error deleting team:", error);

    if (error.message === "Cannot delete team that is currently presenting") {
      return res.status(400).json({ message: error.message });
    }

    if (error.message === "Cannot delete team that has already presented") {
      return res.status(400).json({ message: error.message });
    }

    return res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
  }
});

export default route;
