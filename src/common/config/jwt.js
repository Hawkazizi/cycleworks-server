// config/jwt.js
import "dotenv/config";
import crypto from "crypto";

/**
 * ✅ SECURITY: JWT secret handling.
 * - In production (NODE_ENV=production) a missing JWT_SECRET is a fatal error —
 *   the server refuses to boot instead of silently using a guessable secret.
 * - In development a random ephemeral secret is generated (sessions reset on
 *   restart, which is acceptable and far safer than a static "secret").
 */
function resolveJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (secret && secret.length >= 32) return secret;

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "JWT_SECRET is missing or too weak (< 32 chars). Set a strong secret in the environment before starting in production.",
    );
  }

  console.warn(
    "⚠️ JWT_SECRET missing/weak — using an ephemeral random secret (dev only). Sessions will not survive restarts.",
  );
  return crypto.randomBytes(48).toString("hex");
}

export const JWT_SECRET = resolveJwtSecret();
// OPTIONAL: set a default lifetime in one place
export const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "1d";
