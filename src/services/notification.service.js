// Updated services/notification.service.js
import db from "../db/knex.js";

export const NotificationService = {
  // Create notification
  create: async (userId, type, relatedRelatedId, data = {}) => {
    // Fetch roles to determine language
    const roles = await db("user_roles")
      .join("roles", "roles.id", "user_roles.role_id")
      .where("user_roles.user_id", userId)
      .select("roles.name");
    const roleNames = roles.map((r) => r.name.toLowerCase());
    const isBuyer = roleNames.includes("buyer");
    // Generate localized message based on type (expand as needed)
    let message;
    switch (type) {
      case "status_updated":
        let baseMsg = isBuyer
          ? `Request #${relatedRelatedId} status updated to ${data.farmer_status || data.final_status || ""}`
          : `درخواست #${relatedRelatedId} وضعیت به‌روزرسانی شد به ${data.farmer_status || data.final_status || ""}`;
        if (data.final_status === "completed") {
          baseMsg = isBuyer
            ? `Request #${relatedRelatedId} has been completed!`
            : `درخواست #${relatedRelatedId} تکمیل شد ✅`;
        }
        message = baseMsg;
        break;
      case "request_accepted":
        message = isBuyer
          ? `Request #${relatedRelatedId} has been accepted!`
          : `درخواست #${relatedRelatedId} پذیرفته شد! لطفا آن را تکمیل کنید.`;
        break;
      case "new_request":
        message = isBuyer
          ? `Your new request #${relatedRelatedId} is under review` // If buyer needs this type
          : `درخواست جدید مشتری #${relatedRelatedId} نیاز به بررسی دارد`;
        break;
      case "completed":
        message = isBuyer
          ? `Request #${relatedRelatedId} has been completed!`
          : `درخواست #${relatedRelatedId} تکمیل شد!`;
        break;
      case "new_file_upload":
        message = isBuyer
          ? `New file uploaded for request #${relatedRelatedId} (type: ${data.type || "unknown"})`
          : `فایل جدیدی (نوع: ${data.type || "نامشخص"}) برای درخواست #${relatedRelatedId} بارگذاری شد`;
        break;
      case "new_application":
        message = isBuyer
          ? `New registration application from ${data.user_name} (${data.mobile}) needs review`
          : `درخواست ثبت‌نام جدیدی از ${data.user_name} (${data.mobile}) نیاز به بررسی دارد`;
        break;
      default:
        message = "New notification"; // Fallback; add more types as you have them
        break;
    }
    const [notification] = await db("notifications")
      .insert({
        user_id: userId,
        type,
        message,
        related_request_id: relatedRelatedId ? Number(relatedRelatedId) : null,
        data,
      })
      .returning("*");
    return notification;
  },
  // Get user's notifications
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
  // Mark single as read
  markAsRead: async (notificationId, userId) => {
    const [notification] = await db("notifications")
      .where({ id: notificationId, user_id: userId })
      .update({ status: "read" })
      .returning("*");
    return notification;
  },
  // Mark all as read
  markAllAsRead: async (userId) => {
    return await db("notifications")
      .where({ user_id: userId, status: "unread" })
      .update({ status: "read" });
  },
};
