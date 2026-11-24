import { Router } from "express";
import { shouldUseSecureCookies } from "../../../config/cookies.mjs";
import {
  revokeAdminToken,
  verifyAdminToken,
} from "../../services/authService.mjs";

const route = Router();

route.post("/api/admin/logout", async (req, res) => {
  const token = req.cookies?.adminToken;
  let tokenRevoked = false;

  try {
    const decoded = token ? verifyAdminToken(token) : null;
    if (decoded?.exp) {
      await revokeAdminToken(token, decoded.exp);
      tokenRevoked = true;
    }
  } catch (error) {
    console.error("Error revoking admin token:", error);
    return res.status(500).json({
      success: false,
      message: "Erreur du serveur",
    });
  }

  const IS_STAGING = process.env.NODE_ENV === "staging";
  const secure = shouldUseSecureCookies();
  res.clearCookie("adminToken", {
    httpOnly: true,
    secure,
    sameSite: "lax",
  });

  console.log(
    JSON.stringify({
      event: "admin_logout",
      timestamp: new Date().toISOString(),
      requestId: req.requestId,
      tokenRevoked,
    })
  );

  return res.status(200).json({
    success: true,
    message: "Déconnexion réussie",
  });
});

export default route;
