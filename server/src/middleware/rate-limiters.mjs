import rateLimit from "express-rate-limit";

const retryAfterSeconds = (req, windowMs) => {
  const resetTime = req.rateLimit?.resetTime?.getTime();
  return Math.max(
    1,
    Math.ceil(((resetTime || Date.now() + windowMs) - Date.now()) / 1000)
  );
};

const createRateLimitHandler = (response, windowMs) => (req, res) => {
  const retryAfter = retryAfterSeconds(req, windowMs);
  res.set("Retry-After", String(retryAfter));
  return res.status(429).json({
    ...response,
    retryAfterSeconds: retryAfter,
  });
};

export const adminLoginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 3,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: createRateLimitHandler(
    {
      success: false,
      message: "Too many attempts. Please try again later.",
    },
    15 * 60 * 1000
  ),
});

export const voterRegistrationRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: createRateLimitHandler(
    {
      status: "failed",
      message: "Too many attempts. Please try again later.",
    },
    15 * 60 * 1000
  ),
});
