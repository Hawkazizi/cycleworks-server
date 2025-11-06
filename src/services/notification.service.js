// services/notification.service.js
import db from "../db/knex.js";

/* =======================================================================
   🔔 Notification Service
   Centralized event system for admins, managers, buyers, and suppliers.
======================================================================= */

export const NotificationService = {
  /**
   * Create a new notification entry.
   * Handles localization, role-aware messages, and optional transaction support.
   *
   * @param {number} userId - Recipient user ID.
   * @param {string} type - Notification type.
   * @param {number|null} relatedId - Related entity (e.g., buyer_request ID).
   * @param {object} data - Additional data payload.
   * @param {object|null} trx - Optional Knex transaction (for atomic inserts).
   * @returns {Promise<object>} Created notification record.
   */
  async create(userId, type, relatedId, data = {}, trx = null) {
    const dbConn = trx || db;

    /* ---------- 1️⃣ Detect user roles ---------- */
    const roleNames = await dbConn("user_roles as ur")
      .join("roles as r", "r.id", "ur.role_id")
      .where("ur.user_id", userId)
      .pluck("r.name")
      .then((names) => names.map((n) => n.toLowerCase()));

    const isBuyer = roleNames.includes("buyer");
    const isFarmer = roleNames.includes("user") || roleNames.includes("farmer");
    const isAdminOrManager =
      roleNames.includes("admin") || roleNames.includes("manager");

    /* ---------- 2️⃣ Build message text (localized + role-based) ---------- */
    let message;

    switch (type) {
      /* 🧾 Buyer Request Status Updates */
      case "request_status_changed": {
        const status =
          data.status || data.final_status || data.farmer_status || "—";
        const prefix = isBuyer
          ? `Request #${relatedId}`
          : `درخواست #${relatedId}`;
        message = isBuyer
          ? `${prefix} status updated → ${status}`
          : `${prefix} وضعیت به‌روزرسانی شد به ${status}`;
        break;
      }

      /* ✅ Farmer Accepted Request */
      case "farmer_request_update":
        message = isAdminOrManager
          ? `تأمین‌کننده درخواست #${relatedId} را ${data.status || "به‌روزرسانی"} کرد.`
          : `درخواست #${relatedId} وضعیت جدیدی دارد: ${data.status || "به‌روزرسانی"}.`;
        break;

      /* 📦 Container Tracking Update */
      case "container_tracking_update":
        message = isBuyer
          ? `Tracking update for your request #${relatedId} → ${data.status || "Updated"}`
          : `وضعیت کانتینر برای درخواست #${relatedId} به ${data.status || "به‌روزرسانی"} تغییر کرد.`;
        break;

      /* 📎 Container File Upload */
      case "container_file_uploaded":
        message = isBuyer
          ? `A new file was uploaded for request #${relatedId}`
          : `فایل جدیدی برای درخواست #${relatedId} آپلود شد.`;
        break;

      /* 🧾 Buyer Request Created */
      case "new_request":
        message = isAdminOrManager
          ? `درخواست جدیدی از مشتری (${data.buyerName || "مشتری ناشناس"}) نیاز به بررسی دارد.`
          : `Your new request #${relatedId} is under review.`;
        break;

      /* 🧑‍🌾 New Application Submitted */
      case "application_submitted":
        message = isAdminOrManager
          ? `درخواست ثبت‌نام جدیدی از ${data.user_name} (${data.mobile}) نیاز به بررسی دارد.`
          : `درخواست شما برای عضویت ارسال شد و در انتظار بررسی است.`;
        break;

      /* ✅ General Request Accepted */
      case "request_accepted":
        message = isBuyer
          ? `Request #${relatedId} has been accepted!`
          : `درخواست #${relatedId} توسط تأمین‌کننده پذیرفته شد.`;
        break;

      /* 🚚 Buyer Request Completion */
      case "buyer_request_toggle_completion":
        message = isBuyer
          ? data.is_completed
            ? `Your request #${relatedId} has been completed.`
            : `Your request #${relatedId} has been reactivated.`
          : data.is_completed
            ? `درخواست #${relatedId} خاتمه یافت.`
            : `درخواست #${relatedId} مجدداً فعال شد.`;
        break;

      /* ⚙️ Fallback */
      default:
        message = isBuyer
          ? "New notification received"
          : "اعلان جدید دریافت شد";
        break;
    }

    /* ---------- 3️⃣ Insert notification ---------- */
    const [notification] = await dbConn("notifications")
      .insert({
        user_id: userId,
        type,
        message,
        related_request_id: relatedId ? Number(relatedId) : null,
        data: JSON.stringify(data || {}),
        status: "unread",
      })
      .returning("*");

    return notification;
  },

  /* =====================================================================
     📥 RETRIEVE NOTIFICATIONS (Paginated)
  ===================================================================== */

  /**
   * Retrieve user notifications with pagination and unread count.
   * @param {number} userId - User ID.
   * @param {number} [page=1] - Page number.
   * @param {number} [limit=10] - Items per page.
   */
  async getUserNotifications(userId, page = 1, limit = 10) {
    const offset = (page - 1) * limit;

    const notifications = await db("notifications")
      .where({ user_id: userId })
      .orderBy("created_at", "desc")
      .limit(limit)
      .offset(offset);

    const [{ totalCount }] = await db("notifications")
      .where({ user_id: userId })
      .count("* as totalCount");

    const [{ unreadCount }] = await db("notifications")
      .where({ user_id: userId, status: "unread" })
      .count("* as unreadCount");

    return {
      notifications,
      unreadCount: parseInt(unreadCount || 0),
      page,
      totalPages: Math.ceil((parseInt(totalCount) || 1) / limit),
    };
  },

  /* =====================================================================
     ✅ MARK AS READ
  ===================================================================== */

  /**
   * Mark a single notification as read.
   * @param {number} notificationId - ID of the notification.
   * @param {number} userId - ID of the user.
   */
  async markAsRead(notificationId, userId) {
    const [notification] = await db("notifications")
      .where({ id: notificationId, user_id: userId })
      .update({ status: "read", updated_at: db.fn.now() })
      .returning("*");

    return notification;
  },

  /**
   * Mark all notifications as read for a given user.
   * @param {number} userId - ID of the user.
   */
  async markAllAsRead(userId) {
    await db("notifications")
      .where({ user_id: userId, status: "unread" })
      .update({ status: "read", updated_at: db.fn.now() });
    return { success: true };
  },
};
