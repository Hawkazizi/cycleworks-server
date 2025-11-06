import { Router } from "express";
import { NotificationService } from "../services/notification.service.js";
import { authenticate } from "../middleware/authenticate.js";

const router = Router();

/* =======================================================================
   🔔 NOTIFICATIONS (ALL ROLES)
======================================================================= */

// 📬 Get all notifications (paginated)
router.get("/", authenticate, async (req, res) => {
  try {
    const { page = 1 } = req.query;
    const notifications = await NotificationService.getUserNotifications(
      req.user.id,
      parseInt(page),
    );
    res.json(notifications);
  } catch (err) {
    console.error("Error fetching notifications:", err);
    res.status(500).json({ error: "Failed to load notifications" });
  }
});

// ✅ Mark a single notification as read
router.patch("/:id/read", authenticate, async (req, res) => {
  try {
    const notification = await NotificationService.markAsRead(
      req.params.id,
      req.user.id,
    );

    if (!notification) {
      return res.status(404).json({ error: "Notification not found" });
    }

    res.json({ success: true, data: notification });
  } catch (err) {
    console.error("Error marking notification as read:", err);
    res.status(500).json({ error: "Failed to update notification" });
  }
});

// 🧹 Mark all notifications as read
router.patch("/read-all", authenticate, async (req, res) => {
  try {
    await NotificationService.markAllAsRead(req.user.id);
    res.json({ success: true, message: "All notifications marked as read" });
  } catch (err) {
    console.error("Error marking all as read:", err);
    res.status(500).json({ error: "Failed to update notifications" });
  }
});

export default router;
