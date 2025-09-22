import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../config/jwt.js";

export const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No token provided" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    req.user = {
      id: decoded.id,
      email: decoded.email || null,
      mobile: decoded.mobile || null,
      licenseId: decoded.licenseId || null,
      roles: Array.isArray(decoded.roles)
        ? decoded.roles
        : decoded.role
        ? [decoded.role]
        : [],
    };

    return next();
  } catch (err) {
    // Helpful diagnostics during development
    // console.error("JWT verify error:", err.name, err.message);
    return res.status(401).json({ error: "Invalid token" });
  }
};
