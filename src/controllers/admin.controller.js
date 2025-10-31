// controllers/admin.controller.js
import * as adminService from "../services/admin.service.js";
import * as adminBuyerService from "../services/adminBuyer.service.js";
import * as adminReportService from "../services/adminReport.service.js";
import * as adminFarmerPlansService from "../services/adminFarmerPlans.service.js";
import * as adminTicketService from "../services/adminTicket.service.js";
import db from "../db/knex.js";
import path from "path";
import fs from "fs";
import { NotificationService } from "../services/notification.service.js";
/* -------------------- Auth -------------------- */
// Admin/Manager login
export const loginWithLicense = async (req, res) => {
  try {
    const { licenseKey, role } = req.body;
    if (!licenseKey) {
      return res.status(400).json({ error: "licenseKey is required" });
    }

    const { token, user, roles } = await adminService.loginWithLicense(
      licenseKey,
      role,
    );

    res.json({ token, roles, user });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};
// Get profile (admin or manager)
export const getProfile = async (req, res) => {
  try {
    const adminUserId = req.user.id;
    const admin = await adminService.getAdminProfile(adminUserId);
    res.json({ admin });
  } catch (err) {
    console.error("Get profile error:", err);
    res.status(404).json({ error: "پروفایل یافت نشد" });
  }
};

// Update profile (admin or manager)
export const updateProfile = async (req, res) => {
  try {
    const adminUserId = req.user.id;
    const { name, email, mobile } = req.body;

    if (!name && !email && !mobile) {
      return res
        .status(400)
        .json({ error: "حداقل یکی از فیلدهای پروفایل الزامی است." });
    }

    const updated = await adminService.updateAdminProfile(adminUserId, {
      ...(name && { name }),
      ...(email && { email }),
      ...(mobile && { mobile }),
    });

    res.json({
      message: "پروفایل با موفقیت بروزرسانی شد",
      admin: updated,
    });
  } catch (err) {
    console.error("Update profile error:", err);
    res.status(400).json({ error: err.message });
  }
};

/* -------------------- Upload Admin/Manager Profile Picture -------------------- */
export const uploadProfilePicture = async (req, res) => {
  try {
    const adminId = req.user.id;

    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    // Ensure /uploads/profiles directory exists
    const dir = path.join("uploads", "profiles");
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Move from /uploads/temp → /uploads/profiles
    const newFilePath = `/uploads/profiles/${req.file.filename}`;
    fs.renameSync(req.file.path, path.join(dir, req.file.filename));

    // Get existing admin record
    const admin = await db("users").where({ id: adminId }).first();

    // 🧹 Delete old profile picture if exists
    if (admin?.profile_picture) {
      const oldPath = path.join(
        process.cwd(),
        admin.profile_picture.startsWith("/")
          ? admin.profile_picture.slice(1)
          : admin.profile_picture,
      );

      if (fs.existsSync(oldPath)) {
        try {
          fs.unlinkSync(oldPath);
          console.log(`🧹 Deleted old profile picture: ${oldPath}`);
        } catch (err) {
          console.warn("⚠ Failed to delete old picture:", err.message);
        }
      }
    }

    // 🧠 Update DB
    await db("users").where({ id: adminId }).update({
      profile_picture: newFilePath,
      updated_at: new Date(),
    });

    res.json({
      message: "Profile picture updated successfully",
      profile_picture: newFilePath,
    });
  } catch (err) {
    console.error("uploadProfilePicture (admin) error:", err);
    res.status(500).json({ error: "Failed to upload profile picture" });
  }
};

/* -------------------- Get Admin/Manager Profile Picture -------------------- */
export const getProfilePicture = async (req, res) => {
  try {
    const adminId = req.user.id;
    const admin = await db("users")
      .select("profile_picture")
      .where({ id: adminId })
      .first();

    if (!admin || !admin.profile_picture) {
      return res.status(404).json({ error: "Profile picture not found" });
    }

    const filePath = path.join(
      process.cwd(),
      admin.profile_picture.startsWith("/")
        ? admin.profile_picture.slice(1)
        : admin.profile_picture,
    );

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "File not found on server" });
    }

    const ext = path.extname(filePath).toLowerCase();
    const mimeType =
      ext === ".png"
        ? "image/png"
        : ext === ".webp"
          ? "image/webp"
          : "image/jpeg";

    res.setHeader("Content-Type", mimeType);
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    console.error("getProfilePicture (admin) error:", err);
    res.status(500).json({ error: "Failed to fetch profile picture" });
  }
};

/* -------------------- Delete Admin/Manager Profile -------------------- */
export const deleteProfile = async (req, res) => {
  try {
    const adminId = req.user.id;

    // Delete from DB (reusing your service)
    await db("users").where({ id: adminId }).del();

    res.json({ message: "Admin profile deleted" });
  } catch (err) {
    console.error("deleteProfile (admin) error:", err);
    res.status(500).json({ error: "Failed to delete profile" });
  }
};

/* -------------------- Users -------------------- */
export const createUser = async (req, res) => {
  try {
    const { name, email, password, role_id } = req.body;

    if (!name || !email || !password || !role_id) {
      return res.status(400).json({ error: "اطلاعات کاربر ناقص است." });
    }

    const user = await adminService.createUserWithRole({
      name,
      email,
      password,
      role_id,
    });

    res.status(201).json({ user });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};
// Get all users
export const listUsers = async (req, res) => {
  try {
    const users = await adminService.getAllUsers();
    res.json({ users });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Ban / unban user
export const banOrUnbanUser = async (req, res) => {
  try {
    const { id } = req.params; // target user id
    const { action } = req.body; // "ban" or "unban"
    const adminId = req.user.id; // logged-in admin from JWT
    const updatedUser = await adminService.toggleUserStatus(
      Number(id),
      action,
      adminId,
    );

    res.json({ user: updatedUser });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Get user by id
export async function getUserById(req, res) {
  try {
    const { id } = req.params;

    const user = await db("users as u")
      .leftJoin("user_applications as ua", "u.id", "ua.user_id")
      .select(
        "u.id",
        "u.name",
        "u.email",
        "u.mobile",
        "u.status",
        "u.created_at",
        "ua.supplier_name",
        "ua.status as application_status",
        "ua.reviewed_at",
        "ua.reviewed_by",
      )
      .where("u.id", id)
      .first();

    if (!user) return res.status(404).json({ error: "User not found" });

    // ✅ Buyer requests where this supplier is involved
    const buyerRequests = await db("buyer_requests as br")
      .leftJoin("users as b", "br.buyer_id", "b.id")
      .select(
        "br.id",
        "br.status",
        "br.final_status",
        "br.created_at",
        "b.name as buyer_name",
        "b.email as buyer_email",
        "b.mobile as buyer_mobile",
      )
      .where("br.preferred_supplier_id", id)
      .orWhereIn(
        "br.id",
        db("buyer_request_suppliers")
          .select("buyer_request_id")
          .where("supplier_id", id),
      )
      .orderBy("br.created_at", "desc");

    // ✅ Containers handled by this supplier
    const containers = await db("farmer_plan_containers as c")
      .leftJoin("farmer_plans as p", "c.plan_id", "p.id")
      .leftJoin("buyer_requests as br", "p.request_id", "br.id")
      .select(
        "c.id",
        "c.container_no",
        "c.status",
        "c.created_at",
        "br.id as buyer_request_id",
      )
      .whereIn(
        "p.request_id",
        buyerRequests.map((r) => r.id),
      );

    // ✅ Simple stats
    const stats = {
      total_requests: buyerRequests.length,
      total_containers: containers.length,
      active_requests: buyerRequests.filter(
        (r) => r.status === "accepted" || r.status === "pending",
      ).length,
    };

    res.json({
      user,
      stats,
      buyerRequests,
      containers,
    });
  } catch (err) {
    console.error("getUserById error:", err);
    res.status(500).json({ error: err.message });
  }
}
export const getUserProfilePicture = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await db("users")
      .select("profile_picture")
      .where({ id })
      .first();

    if (!user || !user.profile_picture) {
      // Gracefully return 204 (No Content) so frontend won't throw errors
      return res.status(204).end();
    }
    const filePath = path.join(
      process.cwd(),
      user.profile_picture.startsWith("/")
        ? user.profile_picture.slice(1)
        : user.profile_picture,
    );

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "File not found on server" });
    }

    const ext = path.extname(filePath).toLowerCase();
    const mimeType =
      ext === ".png"
        ? "image/png"
        : ext === ".webp"
          ? "image/webp"
          : "image/jpeg";

    res.setHeader("Content-Type", mimeType);
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    console.error("getUserProfilePicture error:", err);
    res.status(500).json({ error: "Failed to fetch profile picture" });
  }
};

export const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    await adminService.deleteUser(Number(id));
    res.json({ success: true, message: "User and related data deleted" });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};
/* -------------------- Reports -------------------- */

export const exportReportsCSV = async (req, res) => {
  try {
    const csvData = await adminReportService.generateReportsCSV();
    res.header("Content-Type", "text/csv");
    res.attachment("reports.csv");
    return res.send(csvData);
  } catch (err) {
    console.error("CSV export failed:", err);
    res.status(500).json({ error: "Failed to export reports" });
  }
};
/* -------------------- Applications -------------------- */
// Get pending applications
export const getApplications = async (req, res) => {
  try {
    const apps = await adminService.getApplications();
    res.json(apps);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* -------------------- Get Applications by User -------------------- */
export const getApplicationsByUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const apps = await adminService.getApplicationsByUser(userId);

    if (!apps || apps.length === 0) {
      return res
        .status(404)
        .json({ message: "No application found for this user" });
    }

    res.json(apps);
  } catch (err) {
    console.error("getApplicationsByUser error:", err);
    res.status(500).json({ error: err.message });
  }
};

/* -------------------- Update Application (Admin / User / Manager / Farmer) -------------------- */
/* -------------------- Update Application (Admin / User / Manager / Farmer) -------------------- */
export const updateApplication = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const role = req.user.roles[0];

    // 🧠 Combine body + uploaded files
    const updates = { ...req.body };

    // ✅ Handle uploaded files (admins can upload too)
    if (req.files && Object.keys(req.files).length > 0) {
      for (const field in req.files) {
        const file = req.files[field][0];
        updates[field] = JSON.stringify({
          originalname: file.originalname,
          filename: file.filename,
          path: `/uploads/temp/${file.filename}`,
          mimetype: file.mimetype,
          size: file.size,
          uploaded_by: role, // store who uploaded it
          uploaded_at: new Date().toISOString(),
        });
      }
    }

    // ✅ Call updated service function
    const result = await adminService.updateApplication(
      id,
      updates,
      userId,
      role,
    );

    res.json(result);
  } catch (err) {
    console.error("updateApplication error:", err);
    res.status(400).json({ error: err.message });
  }
};

// Approve or reject application
export const reviewApplication = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const reviewerId = req.user.id;

    const result = await adminService.reviewApplication(id, status, reviewerId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

/* -------------------- Final Review (Second Phase) -------------------- */
export const finalizeApplicationReview = async (req, res) => {
  try {
    const { id } = req.params;
    const { final_approved, final_admin_comment } = req.body;
    const userId = req.user.id;
    const role = req.user.roles[0];

    if (!(role === "admin" || role === "manager")) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    const result = await adminService.updateApplication(
      id,
      { final_approved, final_admin_comment },
      userId,
      role,
    );

    res.json(result);
  } catch (err) {
    console.error("finalizeApplicationReview error:", err);
    res.status(400).json({ error: err.message });
  }
};

/* -------------------- Settings -------------------- */
export const getSettings = async (req, res) => {
  try {
    const settings = await adminService.getAllSettings();
    res.json({ settings });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const updateSetting = async (req, res) => {
  try {
    const { key } = req.params;
    const { value } = req.body;
    const updated = await adminService.updateSetting(key, value);
    res.json({ setting: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

/* -------------------- License Keys -------------------- */
export const getLicenseKeys = async (req, res) => {
  try {
    const keys = await adminService.getAllLicenseKeys();
    res.json({ keys });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const createLicenseKey = async (req, res) => {
  try {
    const { key, role_id, assigned_to, user } = req.body;
    const newKey = await adminService.createLicenseKey({
      key,
      role_id,
      assigned_to,
      user,
    });
    res.status(201).json({ key: newKey });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

export const updateLicenseKey = async (req, res) => {
  try {
    const { id } = req.params;
    const { key, role_id, assigned_to } = req.body;

    const updated = await adminService.updateLicenseKey({
      id,
      key,
      role_id,
      assigned_to,
    });

    res.json({ key: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

export const toggleLicenseKey = async (req, res) => {
  try {
    const { id } = req.params;
    const updated = await adminService.toggleLicenseKey(id);
    res.json({ key: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

export const deleteLicenseKey = async (req, res) => {
  try {
    const { id } = req.params;
    await adminService.deleteLicenseKey(id);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

/* -------------------- Roles -------------------- */
export const getRoles = async (req, res) => {
  try {
    const roles = await adminService.getAllRoles();
    res.json({ roles });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* -------------------- Buyer Requests (new flow) -------------------- */
export async function getBuyerRequests(req, res) {
  try {
    const requests = await adminBuyerService.getBuyerRequests();
    res.json(requests);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function getBuyerRequestById(req, res) {
  try {
    const { id } = req.params;
    const request = await adminBuyerService.getBuyerRequestById(id);

    if (!request) {
      return res.status(404).json({ error: "Buyer request not found" });
    }

    res.json(request);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function reviewBuyerRequest(req, res) {
  try {
    const updated = await adminBuyerService.reviewBuyerRequest(req.params.id, {
      status: req.body.status,
      reviewerId: req.user.licenseId,
    });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function addAdminDocs(req, res) {
  try {
    const { id } = req.params;
    const destDir = path.join("uploads", "admin", "buyer-requests", String(id));
    fs.mkdirSync(destDir, { recursive: true });

    const newFiles = (req.files || []).map((f) => {
      const newPath = path.join(destDir, f.filename);
      fs.renameSync(f.path, newPath);

      return {
        type: req.body.type || null, // frontend may send doc type
        filename: f.originalname,
        // 🔥 store only relative path
        path: "/" + newPath.replace(/\\/g, "/"),
      };
    });

    const existing = await db("buyer_requests").where({ id }).first();
    const currentDocs = Array.isArray(existing.admin_docs)
      ? existing.admin_docs
      : existing.admin_docs
        ? JSON.parse(existing.admin_docs)
        : [];

    const updatedDocs = [...currentDocs];
    newFiles.forEach((file) => {
      if (file.type) {
        const idx = updatedDocs.findIndex((d) => d.type === file.type);
        if (idx >= 0) {
          updatedDocs[idx] = file;
        } else {
          updatedDocs.push(file);
        }
      } else {
        updatedDocs.push(file);
      }
    });

    const [updated] = await db("buyer_requests")
      .where({ id })
      .update({
        admin_docs: JSON.stringify(updatedDocs),
        updated_at: db.fn.now(),
      })
      .returning("*");

    res.json(updated);
  } catch (err) {
    console.error("addAdminDocs error:", err);
    res.status(400).json({ error: err.message });
  }
}
export async function updateBuyerRequest(req, res) {
  const { id } = req.params;
  const { preferred_supplier_id } = req.body;

  try {
    const existing = await db("buyer_requests").where({ id }).first();
    if (!existing) {
      return res.status(404).json({ error: "درخواست یافت نشد." });
    }

    // optional: validate supplier exists and is a farmer
    if (preferred_supplier_id) {
      const supplier = await db("users")
        .where({ id: preferred_supplier_id })
        .first();
      if (!supplier) {
        return res.status(400).json({ error: "تامین‌کننده معتبر نیست." });
      }
    }

    const updated = await db("buyer_requests")
      .where({ id })
      .update(
        {
          preferred_supplier_id: preferred_supplier_id || null,
          updated_at: db.fn.now(),
        },
        "*",
      );

    return res.json(updated[0]);
  } catch (err) {
    console.error("updateBuyerRequest error:", err);
    return res.status(500).json({ error: "خطا در بروزرسانی درخواست." });
  }
}
export async function toggleFinalStatus(req, res) {
  try {
    const { id } = req.params;
    const { action } = req.body; // expected: "accepted" or "cancelled"

    if (!["accepted", "cancelled"].includes(action)) {
      return res.status(400).json({ error: "Invalid action" });
    }

    const oldRequest = await db("buyer_requests").where({ id }).first();
    if (!oldRequest)
      return res.status(404).json({ error: "Request not found" });

    const [updated] = await db("buyer_requests")
      .where({ id })
      .update({ final_status: action, updated_at: db.fn.now() })
      .returning("*");

    // ✅ Notify Buyer
    await NotificationService.create(updated.buyer_id, action, id, {
      request_id: id,
      final_status: action,
    });

    // ✅ Notify Admins
    const admins = await db("users")
      .join("user_roles", "users.id", "user_roles.user_id")
      .join("roles", "user_roles.role_id", "roles.id")
      .where("roles.name", "admin")
      .where("users.status", "active")
      .select("users.id");

    for (const admin of admins) {
      await NotificationService.create(admin.id, action, id, {
        request_id: id,
        final_status: action,
      });
    }

    res.json({
      message: `درخواست با وضعیت '${action}' به‌روزرسانی شد`,
      updated,
    });
  } catch (err) {
    console.error("FINAL STATUS TOGGLE ERROR:", err);
    res.status(400).json({ error: err.message });
  }
}

export async function reviewFarmerFile(req, res) {
  try {
    const { fileId } = req.params;
    const { status, note } = req.body;
    const reviewerId = req.user.licenseId;
    const result = await adminFarmerPlansService.reviewFile(
      fileId,
      status,
      note,
      reviewerId,
    );
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function assignSuppliers(req, res) {
  try {
    const { id } = req.params;
    const { supplier_ids } = req.body; // array of supplier IDs
    const reviewerId = req.user.licenseId;

    const result = await adminBuyerService.assignSuppliersToRequest(
      id,
      supplier_ids,
      reviewerId,
    );

    res.json({
      message: "تامین‌کنندگان با موفقیت تخصیص یافتند.",
      assigned: result,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

/* -------------------- Tickets -------------------- */
/* -------------------- List Tickets -------------------- */
export const listTickets = async (req, res) => {
  try {
    const { status } = req.query;
    const tickets = await adminTicketService.listTickets({ status });
    res.json(tickets);
  } catch (err) {
    console.error("LIST TICKETS ERROR:", err);
    res.status(400).json({ error: err.message });
  }
};

/* -------------------- Get Ticket Details -------------------- */
export const getTicket = async (req, res) => {
  try {
    const ticketId = req.params.id;
    const data = await adminTicketService.getTicketWithReplies(ticketId);
    res.json(data);
  } catch (err) {
    console.error("GET TICKET ERROR:", err);
    res.status(400).json({ error: err.message });
  }
};

/* -------------------- Reply to Ticket -------------------- */
export const replyToTicket = async (req, res) => {
  try {
    const ticketId = req.params.id;
    const adminId = req.user.id; // from authenticate
    const { message } = req.body;

    if (!message) return res.status(400).json({ error: "متن پاسخ الزامی است" });

    let fileInfo = null;
    if (req.file) {
      const adminDir = path.join(
        "uploads",
        "admins",
        String(adminId),
        "ticket_replies",
      );
      fs.mkdirSync(adminDir, { recursive: true });

      const filePath = path.join(adminDir, req.file.originalname);
      fs.renameSync(req.file.path, filePath);

      fileInfo = {
        path: "/" + filePath.replace(/\\/g, "/"),
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
      };
    }

    const reply = await adminTicketService.replyToTicket({
      ticketId,
      adminId,
      message,
      file: fileInfo,
    });

    res.status(201).json({
      message: "پاسخ با موفقیت ثبت شد",
      reply,
    });
  } catch (err) {
    console.error("REPLY TICKET ERROR:", err);
    res.status(400).json({ error: err.message });
  }
};

/* -------------------- Close Ticket -------------------- */
export const closeTicket = async (req, res) => {
  try {
    const ticketId = req.params.id;
    const ticket = await adminTicketService.closeTicket(ticketId);
    res.json({ message: "تیکت بسته شد", ticket });
  } catch (err) {
    console.error("CLOSE TICKET ERROR:", err);
    res.status(400).json({ error: err.message });
  }
};

/* -------------------- Delete Ticket (Admin) -------------------- */
export const deleteTicket = async (req, res) => {
  try {
    const ticketId = req.params.id;

    // find ticket
    const ticket = await db("tickets").where({ id: ticketId }).first();
    if (!ticket) {
      return res.status(404).json({ error: "تیکت یافت نشد" });
    }

    // get replies (to remove attachments)
    const replies = await db("ticket_replies").where({ ticket_id: ticketId });

    // delete files (if any)
    const deleteFile = (filePath) => {
      if (!filePath) return;
      const fullPath = path.join(process.cwd(), filePath.replace(/^\//, ""));
      if (fs.existsSync(fullPath)) {
        try {
          fs.unlinkSync(fullPath);
        } catch (err) {
          console.warn("Failed to delete file:", fullPath);
        }
      }
    };

    deleteFile(ticket.attachment_path);
    replies.forEach((r) => deleteFile(r.attachment_path));

    // delete records (replies first)
    await db("ticket_replies").where({ ticket_id: ticketId }).del();
    await db("tickets").where({ id: ticketId }).del();

    res.json({ message: "تیکت و تمام پاسخ‌های آن با موفقیت حذف شدند." });
  } catch (err) {
    console.error("DELETE TICKET ERROR:", err);
    res.status(500).json({ error: "خطا در حذف تیکت" });
  }
};

/* -------------------- Update deadline -------------------- */
export const updateBuyerRequestDeadline = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      new_deadline_start,
      new_deadline_end,
      new_deadline_date, // legacy support
    } = req.body;

    // ✅ Validate input: at least one field is required
    if (!new_deadline_start && !new_deadline_end && !new_deadline_date) {
      return res
        .status(400)
        .json({ error: "حداقل یکی از تاریخ‌های جدید الزامی است." });
    }

    // ✅ Call the updated service (supports both start/end & legacy)
    const updated = await adminBuyerService.updateBuyerRequestDeadline(
      id,
      { new_deadline_start, new_deadline_end, new_deadline_date },
      req.user?.id || null,
    );

    return res.json({
      success: true,
      message: "بازه تحویل با موفقیت به‌روزرسانی شد",
      request: updated,
    });
  } catch (err) {
    console.error("Error updating buyer request deadline:", err);
    return res.status(400).json({ error: err.message });
  }
};

export async function reviewContainerMetadataController(req, res) {
  try {
    const { id } = req.params;
    const { status, note } = req.body;
    const reviewerId = req.user.licenseId; // From middleware

    const result = await adminFarmerPlansService.reviewContainerMetadata(
      id,
      status,
      note,
      reviewerId,
    );
    res.json(result);
  } catch (err) {
    console.error("reviewContainerMetadata error:", err);
    res.status(400).json({ message: err.message });
  }
}

/**
 * Controller: PATCH /api/admin/containers/:id/admin-metadata
 */
export async function updateContainerAdminMetadataController(req, res) {
  try {
    const { id } = req.params;
    const reviewerId = req.user.licenseId; // from authenticate middleware
    const { metadata } = req.body;

    const result = await adminFarmerPlansService.updateContainerAdminMetadata(
      id,
      metadata,
      reviewerId,
    );

    res.json({
      message: "✅ Admin metadata saved successfully",
      container: result,
    });
  } catch (err) {
    console.error("updateContainerAdminMetadata error:", err);
    res.status(400).json({ message: err.message });
  }
}

/* -------------------- completion of a request -------------------- */

export const completeBuyerRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.user.id;

    const result = await adminService.toggleRequestCompletion(id, adminId);
    res.json(result);
  } catch (err) {
    console.error("completeBuyerRequest error:", err);
    res.status(400).json({ error: err.message });
  }
};
