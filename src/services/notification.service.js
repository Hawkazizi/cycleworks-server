// services/notification.service.js
import db from "../db/knex.js";

export const NotificationService = {
  /**
   * Create a new notification.
   * @param {number} userId - The user receiving the notification.
   * @param {string} type - The notification type.
   * @param {number|null} relatedId - The related request or record ID (if any).
   * @param {object} data - Extra data payload.
   * @param {object|null} trx - Optional Knex transaction to ensure FK consistency.
   */
  create: async (userId, type, relatedId, data = {}, trx = null) => {
    const dbConn = trx || db;

    // Determine user role for localization
    const roles = await dbConn("user_roles")
      .join("roles", "roles.id", "user_roles.role_id")
      .where("user_roles.user_id", userId)
      .select("roles.name");

    const roleNames = roles.map((r) => r.name.toLowerCase());
    const isBuyer = roleNames.includes("buyer");

    // 🔹 Message localization logic
    let message;
    switch (type) {
      case "status_updated":
        let baseMsg = isBuyer
          ? `Request #${relatedId} status updated to ${data.farmer_status || data.final_status || ""}`
          : `درخواست #${relatedId} وضعیت به‌روزرسانی شد به ${data.farmer_status || data.final_status || ""}`;
        if (data.final_status === "completed") {
          baseMsg = isBuyer
            ? `Request #${relatedId} has been completed!`
            : `درخواست #${relatedId} تکمیل شد ✅`;
        }
        message = baseMsg;
        break;

      case "request_accepted":
        message = isBuyer
          ? `Request #${relatedId} has been accepted!`
          : `درخواست #${relatedId} پذیرفته شد! لطفا آن را تکمیل کنید.`;
        break;

      case "new_request":
        message = isBuyer
          ? `Your new request #${relatedId} is under review`
          : `درخواست جدید مشتری #${relatedId} نیاز به بررسی دارد`;
        break;

      case "completed":
        message = isBuyer
          ? `Request #${relatedId} has been completed!`
          : `درخواست #${relatedId} تکمیل شد!`;
        break;

      case "new_file_upload":
        message = isBuyer
          ? `New file uploaded for request #${relatedId} (type: ${data.type || "unknown"})`
          : `فایل جدیدی (نوع: ${data.type || "نامشخص"}) برای درخواست #${relatedId} بارگذاری شد`;
        break;

      case "new_application":
        message = isBuyer
          ? `New registration application from ${data.user_name} (${data.mobile}) needs review`
          : `درخواست ثبت‌نام جدیدی از ${data.user_name} (${data.mobile}) نیاز به بررسی دارد`;
        break;

      default:
        message = "New notification";
        break;
    }

    // 🔹 Insert using same transaction (if provided)
    const [notification] = await dbConn("notifications")
      .insert({
        user_id: userId,
        type,
        message,
        related_request_id: relatedId ? Number(relatedId) : null,
        data,
      })
      .returning("*");

    return notification;
  },

  /**
   * Get all notifications for a user with pagination.
   */
  getUserNotifications: async (userId, page = 1, limit = 10) => {
    const offset = (page - 1) * limit;

    const notifications = await db("notifications")
      .where({ user_id: userId })
      .orderBy("created_at", "desc")
      .limit(limit)
      .offset(offset);

    const unreadCount = await db("notifications")
      .where({ user_id: userId, status: "unread" })
      .count()
      .first();

    return {
      notifications,
      unreadCount: parseInt(unreadCount.count),
      page,
      totalPages: Math.ceil(parseInt(unreadCount.count) / limit),
    };
  },

  /**
   * Mark a single notification as read.
   */
  markAsRead: async (notificationId, userId) => {
    const [notification] = await db("notifications")
      .where({ id: notificationId, user_id: userId })
      .update({ status: "read" })
      .returning("*");
    return notification;
  },

  /**
   * Mark all notifications as read.
   */
  markAllAsRead: async (userId) => {
    return await db("notifications")
      .where({ user_id: userId, status: "unread" })
      .update({ status: "read" });
  },
};
