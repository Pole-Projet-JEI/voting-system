import Voter from "../mongodb/voterSchema.mjs";

export const requireAuth = async (req, res, next) => {
  try {
    const { connectionCookie } = req.cookies;

    if (!connectionCookie?.code) {
      return res.status(401).json({
        authenticated: false,
        message: "Not authenticated",
      });
    }

    const voter = await Voter.findOne({ code: connectionCookie.code });

    if (!voter) {
      return res.status(401).json({
        authenticated: false,
        message: "Invalid voter code",
      });
    }

    req.voter = voter;
    req.voterCode = connectionCookie.code;

    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    return res.status(500).json({
      authenticated: false,
      message: "Server error",
    });
  }
};
