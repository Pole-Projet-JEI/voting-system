import { Router } from "express";
import Admin from "../../../mongodb/adminSchema.mjs";
import {
  hashAdminPassword,
  verifyAdminPassword,
  generateAdminToken,
} from "../../services/authService.mjs";
import { requireAdmin } from "../../middleware/requireAdmin.mjs";
import { shouldUseSecureCookies } from "../../../config/cookies.mjs";

const route = Router();

route.post("/api/admin/password", requireAdmin, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const username = req.admin?.username;
  const strongPassword =
    typeof newPassword === "string" &&
    newPassword.length >= 8 &&
    /[a-z]/.test(newPassword) &&
    /[A-Z]/.test(newPassword) &&
    /\d/.test(newPassword) &&
    /[^A-Za-z0-9]/.test(newPassword);

  if (!currentPassword || !strongPassword) {
    return res.status(400).json({
      success: false,
      message:
        "Password must be at least 8 characters and include uppercase, lowercase, a number, and a special character",
    });
  }

  try {
    const admin = await Admin.findOne({ username }).select("+passwordHash");
    if (!admin || !(await verifyAdminPassword(currentPassword, admin.passwordHash))) {
      return res.status(401).json({
        success: false,
        message: "Current password is invalid",
      });
    }

    admin.passwordHash = await hashAdminPassword(newPassword);
    admin.mustChangePassword = false;
    await admin.save();

    const token = generateAdminToken(admin.username, false);
    res.cookie("adminToken", token, {
      httpOnly: true,
      secure: shouldUseSecureCookies(),
      sameSite: shouldUseSecureCookies() ? "strict" : "lax",
      maxAge: 24 * 60 * 60 * 1000,
    });

    return res.json({ success: true, mustChangePassword: false });
  } catch (error) {
    console.error("Error changing admin password:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to change password",
    });
  }
});

export default route;
