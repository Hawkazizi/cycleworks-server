import { Router } from "express";
import { NotificationService } from "../services/notification.service.js";
import { authenticate } from "../middleware/authenticate.js";

const router = Router();

// GET /api/notifications - ALL ROLES
router.get("/", authenticate, async (req, res) => {
  const { page = 1 } = req.query;
  const notifications = await NotificationService.getUserNotifications(
    req.user.id,
    parseInt(page),
  );
  res.json(notifications);
});

// PATCH /api/notifications/:id/read - ALL ROLES
router.patch("/:id/read", authenticate, async (req, res) => {
  const notification = await NotificationService.markAsRead(
    req.params.id,
    req.user.id,
  );
  if (!notification)
    return res.status(404).json({ error: "Notification not found" });
  res.json({ success: true, data: notification });
});

// PATCH /api/notifications/read-all - ALL ROLES
router.patch("/read-all", authenticate, async (req, res) => {
  await NotificationService.markAllAsRead(req.user.id);
  res.json({ success: true, message: "All notifications marked as read" });
});

export default router;
