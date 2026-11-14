import { Router } from "express";
import {
  validateAdminKey,
  authenticateAdmin,
  generateAdminToken,
  isAdminTokenRevoked,
  verifyAdminToken,
} from "../../services/authService.mjs";
import { shouldUseSecureCookies } from "../../../config/cookies.mjs";
import { adminLoginRateLimit } from "../../../middleware/rate-limiters.mjs";

const route = Router();

// Lightweight auth check - just validates token, no data fetching
route.get("/api/admin/auth", async (req, res) => {
  const token = req.cookies?.adminToken;

  if (!token) {
    return res.status(401).json({ authenticated: false });
  }

  try {
    const decoded = verifyAdminToken(token);

    if (!decoded || decoded.role !== "admin" || await isAdminTokenRevoked(token)) {
      return res.status(401).json({ authenticated: false });
    }

    return res.json({
      authenticated: true,
      admin: true,
      username: decoded.username,
      mustChangePassword: decoded.mustChangePassword === true,
    });
  } catch (error) {
    return res.status(401).json({ authenticated: false });
  }
});

route.post("/api/admin/login", adminLoginRateLimit, async (req, res) => {
  try {
    const { username, secretKey } = req.body;

    if (!secretKey) {
      return res.status(400).json({
        success: false,
        message: "Password or secret key is required",
      });
    }

    const accountAuth = await authenticateAdmin(username, secretKey);
    const legacyAuth = !accountAuth.valid && validateAdminKey(secretKey);

    if (!accountAuth.valid && !legacyAuth) {
      console.log(
        ` Failed admin login attempt at ${new Date().toISOString()}`
      );
      return res.status(401).json({
        success: false,
        message: "Invalid admin credentials",
      });
    }

    const token = generateAdminToken(
      accountAuth.username || username || "legacy-admin",
      legacyAuth ? false : accountAuth.mustChangePassword
    );

    // Set HTTPOnly cookie with environment-based security
    const IS_STAGING = process.env.NODE_ENV === "staging";
    res.cookie("adminToken", token, {
      httpOnly: true,
      secure: shouldUseSecureCookies(),
      sameSite: shouldUseSecureCookies() || IS_STAGING ? "strict" : "lax",
      maxAge: 24 * 60 * 60 * 1000,
    });

    console.log(
      `VVVVV Admin logged in successfully at ${new Date().toISOString()}`
    );

    return res.status(200).json({
      success: true,
      admin: true,
      mustChangePassword: legacyAuth ? false : accountAuth.mustChangePassword,
      message: "Login successful",
    });
  } catch (error) {
    console.error("Error during admin login:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

export default route;
