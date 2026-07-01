export const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized", code: "NO_USER" });
    }

    const userRoles = req.user.roles || [];
    const hasRole = userRoles.some((r) => allowedRoles.includes(r));

    if (!hasRole) {
      return res.status(403).json({ error: "Forbidden", code: "FORBIDDEN" });
    }

    next();
  };
};
