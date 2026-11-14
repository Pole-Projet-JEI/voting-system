import {
  isAdminTokenRevoked,
  verifyAdminToken,
} from "../services/authService.mjs";

export const requireAdmin = async (req, res, next) => {
  try {
    const token = req.cookies?.adminToken;

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const decoded = verifyAdminToken(token);

    if (!decoded || decoded.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Invalid or expired token",
      });
    }

    if (await isAdminTokenRevoked(token)) {
      return res.status(403).json({
        success: false,
        message: "Invalid or expired token",
      });
    }

    req.admin = {
      role: decoded.role,
      username: decoded.username,
      mustChangePassword: decoded.mustChangePassword === true,
      authenticatedAt: new Date(decoded.timestamp),
    };

    next();
  } catch (error) {
    console.error("Admin auth error:", error);
    return res.status(500).json({
      success: false,
      message: "Authentication error",
    });
  }
};
