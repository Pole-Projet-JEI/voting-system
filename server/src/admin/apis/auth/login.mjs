import { Router } from "express";
import {
  validateAdminKey,
  generateAdminToken,
  verifyAdminToken,
} from "../../services/authService.mjs";

const route = Router();

// Lightweight auth check - just validates token, no data fetching
route.get("/api/admin/auth", (req, res) => {
  const token = req.cookies?.adminToken;

  if (!token) {
    return res.status(401).json({ authenticated: false });
  }

  try {
    const decoded = verifyAdminToken(token);

    if (!decoded || decoded.role !== "admin") {
      return res.status(401).json({ authenticated: false });
    }

    return res.json({ authenticated: true, admin: true });
  } catch (error) {
    return res.status(401).json({ authenticated: false });
  }
});

route.post("/api/admin/login", async (req, res) => {
  try {
    const { secretKey } = req.body;

    if (!secretKey) {
      return res.status(400).json({
        success: false,
        message: "Secret key is required",
      });
    }

    if (!validateAdminKey(secretKey)) {
      console.log(
        `⚠️ Failed admin login attempt at ${new Date().toISOString()}`
      );
      return res.status(401).json({
        success: false,
        message: "Invalid admin credentials",
      });
    }

    const token = generateAdminToken();

    // Set HTTPOnly cookie with environment-based security
    const IS_PROD = process.env.NODE_ENV === "production";
    const IS_STAGING = process.env.NODE_ENV === "staging";
    res.cookie("adminToken", token, {
      httpOnly: true,
      secure: IS_PROD, // HTTPS only in production (not staging)
      sameSite: IS_PROD || IS_STAGING ? "strict" : "lax",
      maxAge: 24 * 60 * 60 * 1000,
    });

    console.log(
      `VVVVV Admin logged in successfully at ${new Date().toISOString()}`
    );

    return res.status(200).json({
      success: true,
      admin: true,
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
