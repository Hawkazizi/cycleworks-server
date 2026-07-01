import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../config/jwt.js";

export const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      error: "No token provided",
      code: "NO_TOKEN",
    });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    // Attach user info to request
    // ✅ Preserved licenseId for buyers/admins who login via license keys
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
    // 👇 CRITICAL UPDATE: Differentiate between expired and invalid tokens
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({
        error: "Access token expired",
        code: "TOKEN_EXPIRED", // Frontend Axios interceptor will look for this exact code
        message: "Please refresh your token",
      });
    }

    return res.status(401).json({
      error: "Invalid token",
      code: "INVALID_TOKEN",
    });
  }
};
