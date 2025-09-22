// config/jwt.js
import "dotenv/config";

export const JWT_SECRET = process.env.JWT_SECRET || "change-me";
// OPTIONAL: set a default lifetime in one place
export const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "1d";
