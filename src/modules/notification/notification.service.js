import db from "../../common/db/knex.js";

export const NotificationService = {
  async create(userId, type, relatedId, data = {}, trx = null) {
    const dbConn = trx || db;

    const roleNames = await dbConn("user_roles as ur")
      .join("roles as r", "r.id", "ur.role_id")
      .where("ur.user_id", userId)
      .pluck("r.name")
      .then((names) => names.map((n) => n.toLowerCase()));

    const isCustomer = roleNames.includes("buyer");
    const isSupplier = roleNames.includes("user") || roleNames.includes("farmer");
    const isAdminOrManager =
      roleNames.includes("admin") || roleNames.includes("manager");
    const isQc =
      roleNames.includes("qc_internal") || roleNames.includes("qc_external");

    let message;

    switch (type) {
      case "request_status_changed": {
        const status =
          data.status || data.final_status || data.farmer_status || "—";
        const prefix = isCustomer
          ? `Request #${relatedId}`
          : `درخواست #${relatedId}`;
        message = isCustomer
          ? `${prefix} status updated → ${status}`
          : `${prefix} وضعیت به‌روزرسانی شد به ${status}`;
        break;
      }
      case "farmer_request_update":
        message = isAdminOrManager
          ? `تأمین‌کننده درخواست #${relatedId} را ${data.status || "به‌روزرسانی"} کرد.`
          : `درخواست #${relatedId} وضعیت جدیدی دارد: ${data.status || "به‌روزرسانی"}.`;
        break;
      case "container_tracking_update": {
        const status = data.status || "به‌روزرسانی‌شده";
        if (isAdminOrManager || isQc) {
          message = `🔔 تأمین‌کننده ${data.supplierName ? `«${data.supplierName}»` : ""} وضعیت یک کانتینر را به‌روزرسانی کرده است. لطفاً بررسی کنید.`;
        } else if (isCustomer) {
          let readableStatus = "به‌روزرسانی شد";
          if (status === "submitted") readableStatus = "ارسال شده برای بررسی";
          else if (status === "in_progress") readableStatus = "در حال انجام";
          else if (status === "completed") readableStatus = "خاتمه یافته";
          else if (status === "rejected") readableStatus = "رد شده";
          message = `🚚 وضعیت کانتینر شما ${data.tracking_code ? `با کد ${data.tracking_code}` : ""} به "${readableStatus}" تغییر کرد.`;
        } else if (isSupplier) {
          message = `✅ وضعیت کانتینر شما با موفقیت به‌روزرسانی شد و برای مدیر ارسال گردید.`;
        } else {
          message = `وضعیت یک کانتینر به‌روزرسانی شد.`;
        }
        break;
      }
      case "container_plan_date_selected": {
        const date = data.plan_date
          ? new Date(data.plan_date).toLocaleDateString("fa-IR")
          : "—";
        if (isAdminOrManager || isQc) {
          message = `📅 تأمین‌کننده ${data.supplierName ? `«${data.supplierName}»` : ""} تاریخ برنامه‌ریزی برای یکی از کانتینرها را انتخاب کرده است (${date}). لطفاً بررسی فرمایید.`;
        } else if (isCustomer) {
          message = `📅 تاریخ برنامه‌ریزی کانتینر شما برای ${date} تنظیم شد.`;
        } else if (isSupplier) {
          message = `✅ تاریخ ${date} با موفقیت ثبت شد و برای تأیید به مدیر ارسال گردید.`;
        } else {
          message = `📅 تاریخ برنامه‌ریزی کانتینر به‌روزرسانی شد.`;
        }
        break;
      }
      case "container_metadata_updated": {
        const fields = data.metadata_type || "اطلاعات کانتینر";
        if (isAdminOrManager || isQc) {
          message = `🧾 تأمین‌کننده ${data.supplierName ? `«${data.supplierName}»` : ""} اطلاعات کانتینر (${fields}) را به‌روزرسانی کرده است. لطفاً بررسی فرمایید.`;
        } else if (isSupplier) {
          message = `✅ اطلاعات کانتینر شما با موفقیت به‌روزرسانی شد و برای بررسی ارسال گردید.`;
        } else if (isCustomer) {
          message = `ℹ️ اطلاعات جدیدی برای کانتینر ثبت شده است (${fields}).`;
        } else {
          message = `🧾 اطلاعات کانتینر به‌روزرسانی شد.`;
        }
        break;
      }
      case "container_file_uploaded": {
        const fileType = data.fileType || "فایل جدید";
        const supplierName = data.supplierName || "تأمین‌کننده ناشناس";
        if (isAdminOrManager || isQc) {
          message = `📎 تأمین‌کننده «${supplierName}» فایلی از نوع "${fileType}" را برای یکی از کانتینرها بارگذاری کرده است. لطفاً بررسی فرمایید.`;
        } else if (isCustomer) {
          message = `📎 تأمین‌کننده فایلی از نوع "${fileType}" را برای کانتینر شما بارگذاری کرده است.`;
        } else if (isSupplier) {
          message = `✅ فایل "${fileType}" با موفقیت بارگذاری شد و برای بررسی به مدیر ارسال گردید.`;
        } else {
          message = `📎 فایل جدیدی بارگذاری شد.`;
        }
        break;
      }
      case "container_tracking_status_changed": {
        const readable =
          data.readableStatus || data.status || "به‌روزرسانی‌شده";
        if (isAdminOrManager || isQc) {
          message = `🚚 تأمین‌کننده ${data.supplierName ? `«${data.supplierName}»` : ""} وضعیت یکی از کانتینرها را به "${readable}" تغییر داده است. لطفاً بررسی فرمایید.`;
        } else if (isCustomer) {
          message = `🚚 وضعیت کانتینر شما به "${readable}" تغییر کرد.`;
        } else if (isSupplier) {
          message = `✅ وضعیت کانتینر با موفقیت به "${readable}" تغییر یافت.`;
        } else {
          message = `وضعیت یک کانتینر به "${readable}" تغییر کرد.`;
        }
        break;
      }
      case "new_request":
        message =
          isAdminOrManager || isQc
            ? `درخواست جدیدی از مشتری (${data.customerName || "مشتری ناشناس"}) نیاز به بررسی دارد.`
            : `Your new request #${relatedId} is under review.`;
        break;
      case "application_submitted":
        message =
          isAdminOrManager || isQc
            ? `درخواست ثبت‌نام جدیدی از ${data.user_name} (${data.mobile}) نیاز به بررسی دارد.`
            : `درخواست شما برای عضویت ارسال شد و در انتظار بررسی است.`;
        break;
      case "request_accepted":
        message = isCustomer
          ? `Request #${relatedId} has been accepted!`
          : `درخواست #${relatedId} توسط تأمین‌کننده پذیرفته شد.`;
        break;
      case "buyer_request_toggle_completion":
        message = isCustomer
          ? data.is_completed
            ? `Your request #${relatedId} has been completed.`
            : `Your request #${relatedId} has been reactivated.`
          : data.is_completed
            ? `درخواست #${relatedId} خاتمه یافت.`
            : `درخواست #${relatedId} مجدداً فعال شد.`;
        break;

      /* 🔔 QC Internal Actions */
      case "qc_internal_arrived":
        message = isAdminOrManager
          ? `✅ QC داخلی کانتینر #${relatedId} را تحویل گرفت.`
          : `کانتینر شما توسط QC داخلی تحویل گرفته شد.`;
        break;
      case "qc_internal_inspection_submitted":
        message = isAdminOrManager
          ? `📝 بازرسی QC داخلی کانتینر #${relatedId} ثبت شد. لطفاً بررسی کنید.`
          : `بازرسی QC داخلی کانتینر شما ثبت شد.`;
        break;
      case "qc_internal_cleared":
        message = isAdminOrManager
          ? `✅ کانتینر #${relatedId} توسط QC داخلی تایید شد.`
          : `کانتینر شما توسط QC داخلی تایید شد.`;
        break;
      case "qc_internal_hold":
        message = isAdminOrManager
          ? `⚠️ کانتینر #${relatedId} توسط QC داخلی متوقف شد. دلیل: ${data.reason || "نامشخص"}`
          : `کانتینر شما توسط QC داخلی متوقف شد.`;
        break;
      case "qc_internal_hold_released":
        message = isAdminOrManager
          ? `✅ توقف کانتینر #${relatedId} توسط QC داخلی لغو شد.`
          : `توقف کانتینر شما توسط QC داخلی لغو شد.`;
        break;
      case "qc_admin_metadata_updated":
        message = isAdminOrManager
          ? `🧾 QC داخلی اطلاعات ادمین کانتینر #${relatedId} را به‌روزرسانی کرد.`
          : `اطلاعات ادمین کانتینر شما به‌روزرسانی شد.`;
        break;

      /* 🔔 QC External Actions */
      case "qc_external_report_submitted":
        message = isAdminOrManager
          ? `🌍 گزارش QC خارجی برای کانتینر #${relatedId} ثبت شد.`
          : `گزارش QC خارجی کانتینر شما ثبت شد.`;
        break;

      /* 🔔 NEW: Admin Actions affecting QC */
      case "container_completed_by_admin":
        message = isQc
          ? `✅ کانتینر #${relatedId} توسط ادمین تکمیل و تحویل داده شد.`
          : `کانتینر شما توسط ادمین تکمیل شد.`;
        break;
      case "admin_file_deleted":
        message = isQc
          ? `🗑️ ادمین فایلی را از کانتینر #${relatedId} حذف کرد.`
          : `فایلی از کانتینر شما توسط ادمین حذف شد.`;
        break;
      case "admin_metadata_updated_by_admin":
        message = isQc
          ? `🧾 ادمین اطلاعات ادمین کانتینر #${relatedId} را به‌روزرسانی کرد.`
          : `اطلاعات ادمین کانتینر شما به‌روزرسانی شد.`;
        break;
      case "container_rejected_by_admin":
        message = isQc
          ? `❌ کانتینر #${relatedId} توسط ادمین رد شد.`
          : `کانتینر شما توسط ادمین رد شد.`;
        break;
      case "container_unrejected_by_admin":
        message = isQc
          ? `✅ وضعیت رد کانتینر #${relatedId} توسط ادمین لغو شد.`
          : `وضعیت رد کانتینر شما توسط ادمین لغو شد.`;
        break;
      case "container_assigned_to_supplier":
        message = isQc
          ? `📦 کانتینرهای جدیدی به تامین‌کنندگان تخصیص یافت (درخواست #${relatedId}).`
          : `کانتینرهای جدیدی به تامین‌کنندگان تخصیص یافت.`;
        break;
      case "admin_file_uploaded":
        message = isQc
          ? `📎 ادمین فایلی را به کانتینر #${relatedId} اضافه کرد.`
          : `فایلی توسط ادمین به کانتینر شما اضافه شد.`;
        break;
      case "admin_file_reviewed":
        message = isQc
          ? `🧾 ادمین وضعیت فایل کانتینر #${relatedId} را بررسی کرد.`
          : `وضعیت فایل شما توسط ادمین بررسی شد.`;
        break;
      case "admin_metadata_reviewed":
        message = isQc
          ? `🧾 ادمین متادیتای کانتینر #${relatedId} را بررسی کرد.`
          : `متادیتای کانتینر شما توسط ادمین بررسی شد.`;
        break;

      default:
        message = `رویداد جدید (${type})`;
    }

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

  async markAsRead(notificationId, userId) {
    const [notification] = await db("notifications")
      .where({ id: notificationId, user_id: userId })
      .update({ status: "read", updated_at: db.fn.now() })
      .returning("*");
    return notification;
  },

  async markAllAsRead(userId) {
    await db("notifications")
      .where({ user_id: userId, status: "unread" })
      .update({ status: "read", updated_at: db.fn.now() });
    return { success: true };
  },
};
