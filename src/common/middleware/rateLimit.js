import rateLimit from "express-rate-limit";

/**
 * ✅ SECURITY: strict limiter for credential endpoints (brute-force protection).
 * 30 attempts / 15 min / IP is enough for real users and heavy for bots.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts, please try again later" },
});

/** Slightly lighter limiter for token refresh (called automatically by the clients). */
export const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
});
