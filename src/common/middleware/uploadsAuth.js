import path from "path";
import { pathToFileURL } from "url";
import { fileURLToPath } from "url";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../config/jwt.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOADS_ROOT = path.resolve(__dirname, "../../..", "uploads");

/**
 * ✅ SECURITY: uploads are private.
 * Files are served ONLY with a valid access token:
 *  - "Authorization: Bearer <token>" header (axios / fetch downloads)
 *  - "?token=<token>" query param (<img src> / <a href> tags)
 * Anonymous requests get 403 — no file is ever world-readable anymore.
 */
export const requireUploadToken = (req, res, next) => {
  const header = req.headers.authorization;
  const queryToken = req.query?.token;

  if (queryToken && typeof queryToken === "string") {
    try {
      jwt.verify(queryToken, JWT_SECRET);
      return next();
    } catch {
      /* fall through to 403 */
    }
  }

  if (header?.startsWith("Bearer ")) {
    try {
      jwt.verify(header.slice(7), JWT_SECRET);
      return next();
    } catch {
      /* fall through to 403 */
    }
  }

  return res.status(403).json({ error: "Forbidden", code: "UPLOAD_FORBIDDEN" });
};

// path used by server.js to mount express.static safely
export const uploadsRoot = UPLOADS_ROOT;