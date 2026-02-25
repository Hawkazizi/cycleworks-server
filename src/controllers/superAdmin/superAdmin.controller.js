import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../../config/jwt.js";

const SUPER_ADMIN_KEY = process.env.SUPER_ADMIN_KEY; // server env only

export const login = async (req, res) => {
  const { key } = req.body;

  if (!SUPER_ADMIN_KEY) {
    return res.status(500).json({ error: "SUPER_ADMIN_KEY not configured" });
  }

  if (!key || key !== SUPER_ADMIN_KEY) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  // create a very small identity (no DB required)
  const token = jwt.sign(
    {
      id: "superadmin",
      email: "superadmin@local",
      roles: ["super_admin"],
    },
    JWT_SECRET,
    { expiresIn: "2h" },
  );

  res.json({
    token,
    user: {
      id: "superadmin",
      email: "superadmin@local",
      roles: ["super_admin"],
    },
  });
};

export const me = (req, res) => {
  res.json({ user: req.user });
};
