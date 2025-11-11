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
      case "container_tracking_update": {
        const status = data.status || "به‌روزرسانی‌شده";
        const containerId = data.containerId || relatedId;

        if (isAdminOrManager) {
          // Admins & Managers see a clear review action
          message = `🔔 تأمین‌کننده ${
            data.supplierName ? `«${data.supplierName}»` : ""
          } وضعیت یک کانتینر را به‌روزرسانی کرده است. لطفاً بررسی کنید.`;
        } else if (isBuyer) {
          // Buyers see a friendly progress message
          let readableStatus = "به‌روزرسانی شد";
          if (status === "submitted") readableStatus = "ارسال شده برای بررسی";
          else if (status === "in_progress") readableStatus = "در حال انجام";
          else if (status === "completed") readableStatus = "خاتمه یافته";
          else if (status === "rejected") readableStatus = "رد شده";

          message = `🚚 وضعیت کانتینر شما ${
            data.tracking_code ? `با کد ${data.tracking_code}` : ""
          } به "${readableStatus}" تغییر کرد.`;
        } else if (isFarmer) {
          // Supplier/farmer gets acknowledgment
          message = `✅ وضعیت کانتینر شما با موفقیت به‌روزرسانی شد و برای مدیر ارسال گردید.`;
        } else {
          // fallback (rare)
          message = `وضعیت یک کانتینر به‌روزرسانی شد.`;
        }
        break;
      }

      /* 🗓️ Container Plan Date Selected */
      case "container_plan_date_selected": {
        const date = data.plan_date
          ? new Date(data.plan_date).toLocaleDateString("fa-IR")
          : "—";

        if (isAdminOrManager) {
          message = `📅 تأمین‌کننده ${
            data.supplierName ? `«${data.supplierName}»` : ""
          } تاریخ برنامه‌ریزی برای یکی از کانتینرها را انتخاب کرده است (${date}). لطفاً بررسی فرمایید.`;
        } else if (isBuyer) {
          message = `📅 تاریخ برنامه‌ریزی کانتینر شما برای ${date} تنظیم شد.`;
        } else if (isFarmer) {
          message = `✅ تاریخ ${date} با موفقیت ثبت شد و برای تأیید به مدیر ارسال گردید.`;
        } else {
          message = `📅 تاریخ برنامه‌ریزی کانتینر به‌روزرسانی شد.`;
        }
        break;
      }
      /* 🧾 Container Metadata Updated */
      case "container_metadata_updated": {
        const fields = data.metadata_type || "اطلاعات کانتینر";

        if (isAdminOrManager) {
          message = `🧾 تأمین‌کننده ${
            data.supplierName ? `«${data.supplierName}»` : ""
          } اطلاعات کانتینر (${fields}) را به‌روزرسانی کرده است. لطفاً بررسی فرمایید.`;
        } else if (isFarmer) {
          message = `✅ اطلاعات کانتینر شما با موفقیت به‌روزرسانی شد و برای بررسی ارسال گردید.`;
        } else if (isBuyer) {
          message = `ℹ️ اطلاعات جدیدی برای کانتینر ثبت شده است (${fields}).`;
        } else {
          message = `🧾 اطلاعات کانتینر به‌روزرسانی شد.`;
        }
        break;
      }

      /* 📎 Container File Uploaded */
      case "container_file_uploaded": {
        const fileType = data.fileType || "فایل جدید";
        const supplierName = data.supplierName || "تأمین‌کننده ناشناس";

        if (isAdminOrManager) {
          message = `📎 تأمین‌کننده «${supplierName}» فایلی از نوع "${fileType}" را برای یکی از کانتینرها بارگذاری کرده است. لطفاً بررسی فرمایید.`;
        } else if (isBuyer) {
          message = `📎 تأمین‌کننده فایلی از نوع "${fileType}" را برای کانتینر شما بارگذاری کرده است.`;
        } else if (isFarmer) {
          message = `✅ فایل "${fileType}" با موفقیت بارگذاری شد و برای بررسی به مدیر ارسال گردید.`;
        } else {
          message = `📎 فایل جدیدی بارگذاری شد.`;
        }
        break;
      }

      /* 🚚 Container Tracking Status Changed */
      case "container_tracking_status_changed": {
        const readable =
          data.readableStatus || data.status || "به‌روزرسانی‌شده";
        if (isAdminOrManager) {
          message = `🚚 تأمین‌کننده ${
            data.supplierName ? `«${data.supplierName}»` : ""
          } وضعیت یکی از کانتینرها را به "${readable}" تغییر داده است. لطفاً بررسی فرمایید.`;
        } else if (isBuyer) {
          message = `🚚 وضعیت کانتینر شما به "${readable}" تغییر کرد.`;
        } else if (isFarmer) {
          message = `✅ وضعیت کانتینر با موفقیت به "${readable}" تغییر یافت.`;
        } else {
          message = `وضعیت یک کانتینر به "${readable}" تغییر کرد.`;
        }
        break;
      }

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
