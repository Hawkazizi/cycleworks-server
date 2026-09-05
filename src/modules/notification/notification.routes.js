import { Router } from "express";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../../common/config/jwt.js";
import { als } from "../../common/db/knex.js";
import { NotificationService } from "./notification.service.js";
import { authenticate } from "../../common/middleware/authenticate.js";
import { addClient, removeClient } from "./sseHub.js";

const router = Router();

/* =======================================================================
   📡 REAL-TIME STREAM (SSE)
   EventSource cannot send headers, so the token and country may arrive
   as query parameters. Auth + country are verified here before opening
   the stream.
======================================================================= */
router.get("/stream", async (req, res) => {
  // 1) Auth — header (fetch-based clients) or ?token= (EventSource)
  let token = null;
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    token = authHeader.split(" ")[1];
  } else if (req.query.token) {
    token = String(req.query.token);
  }

  let userId;
  try {
    if (!token) throw new Error("no token");
    const decoded = jwt.verify(token, JWT_SECRET);
    userId = decoded.id;
  } catch {
    return res.status(401).json({ error: "Invalid token", code: "INVALID_TOKEN" });
  }

  // 2) Multi-tenancy — header if present, otherwise ?country= (default IR)
  const country =
    req.headers["x-country"]?.toUpperCase() ||
    String(req.query.country || "IR").toUpperCase();

  // 3) Open the stream inside the tenant context
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no", // nginx: don't buffer
  });

  const openStream = () => {
    addClient(userId, res);
    res.write(`event: connected\ndata: ${JSON.stringify({ userId })}\n\n`);

    // Initial unread count so the badge is correct immediately
    NotificationService.getUnreadCount(userId)
      .then((unreadCount) => {
        res.write(
          `event: unread_count\ndata: ${JSON.stringify({ unreadCount })}\n\n`,
        );
      })
      .catch(() => {});

    req.on("close", () => removeClient(userId, res));
  };

  if (country === "IR") {
    openStream();
  } else {
    als.run(country, openStream);
  }
});

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
