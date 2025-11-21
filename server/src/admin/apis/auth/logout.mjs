import { Router } from "express";

const route = Router();

route.post("/api/admin/logout", (req, res) => {
  res.clearCookie("adminToken", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
  });

  console.log(`Admin logged out at ${new Date().toISOString()}`);

  return res.status(200).json({
    success: true,
    message: "Logged out successfully",
  });
});

export default route;
