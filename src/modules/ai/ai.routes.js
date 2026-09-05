import { Router } from "express";
import rateLimit from "express-rate-limit";
import { authenticate } from "../../common/middleware/authenticate.js";
import * as aiController from "./ai.controller.js";

const router = Router();

// ✅ SECURITY: per-IP limit for AI calls (cost control)
const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many AI requests, please try again later" },
});

/**
 * 🤖 AI assistant chat (all panels).
 * Body: { panel: "customer"|"supplier"|"admin"|"manager"|"qc_internal"|"qc_external"|"super_admin",
 *         messages: [{ role: "user"|"assistant", content: string }, ...] }
 * The panel role is validated against the caller's real roles.
 */
router.post("/chat", authenticate, aiLimiter, aiController.chat);

export default router;
