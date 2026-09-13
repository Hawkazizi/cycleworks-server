import { chatWithAssistant } from "./ai.service.js";
import { ROLES } from "../../common/constants/roles.js";

/**
 * ✅ Map each UI panel to the roles allowed to use it and the AI scope.
 * The panel's AI scope can never exceed the caller's real server permissions,
 * because the caller's roles are verified here (same roles the routes check).
 */
const PANELS = {
  customer: { roles: [ROLES.CUSTOMER] },
  supplier: { roles: [ROLES.SUPPLIER] },
  admin: { roles: [ROLES.ADMIN] },
  manager: { roles: [ROLES.MANAGER] },
  qc_internal: { roles: [ROLES.QC_INTERNAL] },
  qc_external: { roles: [ROLES.QC_EXTERNAL] },
  super_admin: { roles: [ROLES.SUPER_ADMIN] },
};

export async function chat(req, res) {
  try {
    const { panel, messages } = req.body || {};

    const config = PANELS[panel];
    if (!config) {
      return res.status(400).json({ error: "Unknown panel" });
    }

    const userRoles = req.user.roles || [];
    if (!userRoles.some((r) => config.roles.includes(r))) {
      return res
        .status(403)
        .json({ error: "Forbidden", code: "FORBIDDEN" });
    }

    if (
      !Array.isArray(messages) ||
      messages.length === 0 ||
      messages.length > 30 ||
      messages.some(
        (m) =>
          !m ||
          typeof m.content !== "string" ||
          !m.content.trim() ||
          m.content.length > 6000,
      )
    ) {
      return res.status(400).json({ error: "Invalid messages" });
    }

    const reply = await chatWithAssistant({ panel, messages, user: req.user });
    res.json({ reply });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    console.error("AI chat error:", err);
    res.status(500).json({ error: "AI assistant unavailable" });
  }
}
