import { findAuthenticatedVoter } from "./participant-session.mjs";

export const requireAuth = async (req, res, next) => {
  try {
    const voter = await findAuthenticatedVoter(req);

    if (!voter) {
      return res.status(401).json({
        authenticated: false,
        message: "Not authenticated",
      });
    }

    req.voter = voter;
    req.voterCode = voter.code;

    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    return res.status(500).json({
      authenticated: false,
      message: "Server error",
    });
  }
};
