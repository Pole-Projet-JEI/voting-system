import { Router } from "express";
import { shouldUseSecureCookies } from "../../../config/cookies.mjs";
import {
  revokeAdminToken,
  verifyAdminToken,
} from "../../services/authService.mjs";

const route = Router();

route.post("/api/admin/logout", async (req, res) => {
  const token = req.cookies?.adminToken;

  try {
    const decoded = token ? verifyAdminToken(token) : null;
    if (decoded?.exp) {
      await revokeAdminToken(token, decoded.exp);
    }
  } catch (error) {
    console.error("Error revoking admin token:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }

  const IS_STAGING = process.env.NODE_ENV === "staging";
  const secure = shouldUseSecureCookies();
  res.clearCookie("adminToken", {
    httpOnly: true,
    secure,
    sameSite: secure || IS_STAGING ? "strict" : "lax",
  });

  console.log(`Admin logged out at ${new Date().toISOString()}`);

  return res.status(200).json({
    success: true,
    message: "Logged out successfully",
  });
});

export default route;
