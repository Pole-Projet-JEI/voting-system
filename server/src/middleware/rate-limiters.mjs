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

// Voter login: only WRONG codes count, and the cap is per client IP.
// A whole auditorium often shares one public IP (venue Wi-Fi / mobile CGNAT),
// so the cap must allow many people's typos while still stopping a script
// that guesses codes (9 chars over 36 symbols = ~10^14 possibilities).
const parseLimit = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

export const VOTER_LOGIN_FAILED_ATTEMPTS_LIMIT = parseLimit(
  process.env.VOTER_LOGIN_FAILED_ATTEMPTS_LIMIT,
  300
);

export const voterRegistrationRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: VOTER_LOGIN_FAILED_ATTEMPTS_LIMIT,
  skipSuccessfulRequests: true,
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
