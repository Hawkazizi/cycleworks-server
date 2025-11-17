import * as adminService from "../services/admin.service.js";
import * as adminBuyerService from "../services/adminBuyer.service.js";
import * as adminReportService from "../services/adminReport.service.js";
import * as adminFarmerPlansService from "../services/adminFarmerPlans.service.js";
import * as adminTicketService from "../services/adminTicket.service.js";
import db from "../db/knex.js";
import path from "path";
import fs from "fs";
import xlsx from "xlsx";
import bcrypt from "bcrypt";
import crypto from "crypto";
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
    const { name, email, password, role_id, mobile } = req.body; // ✅ added mobile

    if (!name || !email || !password || !role_id || !mobile) {
      return res.status(400).json({ error: "اطلاعات کاربر ناقص است." });
    }

    const user = await adminService.createUserWithRole({
      name,
      email,
      password,
      role_id,
      mobile, // ✅ pass down to service
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
export const getBuyerRequestById = async (req, res) => {
  try {
    const { id } = req.params; // buyer_request_id

    // 1️⃣ Fetch base buyer request with full details and all user joins
    const request = await db("buyer_requests as br")
      .leftJoin("users as buyer", "br.buyer_id", "buyer.id")
      .leftJoin("users as ps", "br.preferred_supplier_id", "ps.id")
      .leftJoin("users as creator", "br.creator_id", "creator.id")
      .select(
        // Buyer Request Core
        "br.id",
        "br.buyer_id",
        "br.status",
        "br.reviewed_by",
        "br.reviewed_at",
        "br.created_at",
        "br.updated_at",
        "br.size",
        "br.expiration_date",
        "br.certificates",
        "br.import_country",
        "br.entry_border",
        "br.exit_border",
        "br.preferred_supplier_name",
        "br.preferred_supplier_id",
        "br.packaging",
        "br.egg_type",
        "br.container_amount",
        "br.expiration_days",
        "br.transport_type",
        "br.product_type",
        "br.cartons",
        "br.description",
        "br.creator_id",
        "br.admin_extra_files",
        "br.deadline_start",
        "br.deadline_end",

        // Buyer Info
        "buyer.name as buyer_name",
        "buyer.email as buyer_email",
        "buyer.mobile as buyer_mobile",

        // Preferred Supplier Info
        "ps.name as preferred_supplier_name",
        "ps.email as preferred_supplier_email",
        "ps.mobile as preferred_supplier_mobile",
      )
      .where("br.id", id)
      .first();

    if (!request)
      return res.status(404).json({ error: "Buyer request not found" });

    // 2️⃣ Fetch farmer plans linked to this buyer request
    const plans = await db("farmer_plans as fp")
      .select("fp.id", "fp.plan_date", "fp.created_at", "fp.request_id")
      .where("fp.request_id", id);

    // 3️⃣ Assigned suppliers (request-level)
    request.assigned_suppliers = await db("buyer_request_suppliers as brs")
      .leftJoin("users as s", "brs.supplier_id", "s.id")
      .select(
        "brs.id",
        "brs.supplier_id",
        "s.name as supplier_name",
        "s.mobile as supplier_mobile",
        "brs.share_percentage",
        "brs.assigned_at",
        "brs.container_id",
      )
      .where("brs.buyer_request_id", id);

    // 4️⃣ For each plan → include containers, files, tracking, metadata
    for (const plan of plans) {
      const containers = await db("farmer_plan_containers as c")
        .leftJoin("farmer_plans as p", "c.plan_id", "p.id")
        .leftJoin("buyer_requests as br", "p.request_id", "br.id")
        .leftJoin("users as supplier", "c.supplier_id", "supplier.id")
        .select(
          "c.id",
          "c.plan_id",
          "c.container_no",
          "c.status as container_status",
          "c.created_at as container_created_at",
          "c.tracking_code",
          "br.entry_border",
          "br.exit_border",
          "br.egg_type",
          "br.import_country",
          "br.cartons",
          "br.container_amount",
          "c.admin_metadata",
          "c.admin_metadata_status",
          "c.admin_metadata_review_note",
          "supplier.name as supplier_name",
          "supplier.mobile as supplier_mobile",
          "c.supplier_id",
        )
        .where("c.plan_id", plan.id)
        .orderBy("c.id", "asc");

      for (const c of containers) {
        // 🧾 Files
        c.files = await db("farmer_plan_files")
          .where({ container_id: c.id })
          .select("id", "file_key", "original_name", "path", "status");

        // 🛰 Tracking
        c.tracking_history = await db("container_tracking_statuses")
          .where({ container_id: c.id })
          .select("id", "status", "created_at")
          .orderBy("created_at", "desc");

        // 🧠 Safe JSON parse
        try {
          c.admin_metadata = c.admin_metadata
            ? JSON.parse(c.admin_metadata)
            : {};
        } catch {
          c.admin_metadata = {};
        }
      }

      plan.containers = containers;
    }

    request.farmer_plans = plans;

    // ✅ Final response
    res.json(request);
  } catch (err) {
    console.error("getBuyerRequestById error:", err);
    res.status(500).json({ error: "Failed to load buyer request details" });
  }
};

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
    const currentDocs = Array.isArray(existing.admin_extra_files)
      ? existing.admin_extra_files
      : existing.admin_extra_files
        ? JSON.parse(existing.admin_extra_files)
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
        admin_extra_files: JSON.stringify(updatedDocs),
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
      .update({ status: action, updated_at: db.fn.now() })
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
    const { supplier_ids } = req.body;
    const reviewerId = req.user.licenseId;

    const inserts = supplier_ids.map((sid) => ({
      buyer_request_id: id,
      supplier_id: sid,
      assigned_by: reviewerId,
      assigned_at: new Date(),
    }));

    await db.transaction(async (trx) => {
      for (const row of inserts) {
        await trx("buyer_request_suppliers")
          .insert(row)
          .onConflict(["buyer_request_id", "supplier_id"])
          .merge({ assigned_at: new Date(), assigned_by: reviewerId });
      }
    });

    res.json({ message: "Suppliers assigned successfully" });
  } catch (err) {
    console.error("assignSuppliers error:", err);
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

/* -------------------- List Containers by Request (Safe + Idempotent) -------------------- */
export const listContainersByRequestId = async (req, res) => {
  try {
    const { requestId } = req.query;
    if (!requestId)
      return res.status(400).json({ error: "Missing requestId parameter" });

    // 1️⃣ Fetch buyer request
    const buyerReq = await db("buyer_requests")
      .select("id", "container_amount")
      .where("id", requestId)
      .first();

    if (!buyerReq)
      return res.status(404).json({ error: "Buyer request not found" });

    const containers = await db.transaction(async (trx) => {
      /* ------------------------------------------------------------------
         2️⃣ Ensure exactly ONE farmer_plan per buyer_request (idempotent)
      ------------------------------------------------------------------ */
      await trx("farmer_plans")
        .insert({
          request_id: buyerReq.id,
          status: "submitted",
          plan_date: new Date(),
        })
        .onConflict("request_id")
        .ignore();

      const plan = await trx("farmer_plans")
        .where({ request_id: buyerReq.id })
        .first();

      /* ------------------------------------------------------------------
         3️⃣ Ensure containers exist (safe even if double-called)
      ------------------------------------------------------------------ */
      const existingCount = await trx("farmer_plan_containers")
        .where({ plan_id: plan.id })
        .count("* as count")
        .first();

      if (Number(existingCount.count) === 0 && buyerReq.container_amount > 0) {
        const inserts = Array.from(
          { length: buyerReq.container_amount },
          (_, i) => ({
            plan_id: plan.id,
            container_no: i + 1,
            status: "submitted",
            buyer_request_id: buyerReq.id,
          }),
        );

        await trx("farmer_plan_containers")
          .insert(inserts)
          .onConflict(["plan_id", "container_no"])
          .ignore();
      }

      /* ------------------------------------------------------------------
         4️⃣ Return enriched container list with supplier info
      ------------------------------------------------------------------ */
      const rows = await trx("farmer_plan_containers as c")
        .leftJoin("users as u", "c.supplier_id", "u.id")
        .select(
          "c.id as container_id",
          "c.container_no",
          "c.status as container_status",
          "c.created_at as container_created_at",
          "c.supplier_id",
          "u.name as supplier_name",
          "u.mobile as supplier_mobile",
        )
        .where("c.plan_id", plan.id)
        .orderBy("c.container_no", "asc");

      return rows;
    });

    res.json({ containers });
  } catch (err) {
    console.error("listContainersByRequestId (safe) error:", err);
    res.status(500).json({ error: "Failed to load containers" });
  }
};

/* -------------------- List ALL Containers (for Admin) -------------------- */
export const listAllContainersWithTracking = async (req, res) => {
  try {
    const containers = await db("farmer_plan_containers as c")
      .leftJoin("farmer_plans as fp", "c.plan_id", "fp.id")
      .leftJoin("buyer_requests as br", "fp.request_id", "br.id")
      .leftJoin("users as supplier", "c.supplier_id", "supplier.id")
      .leftJoin("users as buyer", "br.buyer_id", "buyer.id")
      .leftJoin("users as operator", "br.creator_id", "operator.id")
      // 🧩 latest tracking join
      .leftJoin(
        db("container_tracking_statuses as t")
          .select("container_id")
          .max("created_at as latest_time")
          .groupBy("container_id")
          .as("last"),
        "c.id",
        "last.container_id",
      )
      .leftJoin("container_tracking_statuses as ct", function () {
        this.on("ct.container_id", "=", "c.id").andOn(
          "ct.created_at",
          "=",
          "last.latest_time",
        );
      })
      .select(
        "c.id as container_id",
        "c.container_no",
        "c.status as container_status",
        "c.created_at",
        "c.updated_at",
        "supplier.name as supplier_name",
        "buyer.name as buyer_name",
        "operator.name as operator_name",
        "br.import_country",
        "br.product_type",
        "br.egg_type",
        "br.cartons",
        "ct.status as latest_status",
        "ct.note as latest_note",
        "ct.created_at as latest_tracking_time",
        // 🧠 derive TY number from either tracking_code or metadata (can be null)
        db.raw(`
          COALESCE(
            NULLIF(TRIM(ct.tracking_code), ''),
            NULLIF(TRIM(c.metadata->>'ty_number'), ''),
            NULLIF(TRIM((c.metadata->'metadata'->>'ty_number')), '')
          ) AS ty_number
        `),
      )
      // 🗑️ REMOVED the .whereRaw() filter here to include ALL containers
      .orderBy("c.created_at", "desc");

    res.json(containers);
  } catch (err) {
    console.error("listAllContainersWithTracking error:", err);
    res.status(500).json({ error: "Failed to load all containers" });
  }
};

/* -------------------- Assign Containers to Suppliers -------------------- */
export const assignContainersToSuppliers = async (req, res) => {
  try {
    const { requestId, assignments } = req.body;

    if (!requestId) {
      return res.status(400).json({ error: "Missing requestId" });
    }

    // Allow empty array to mean “clear all assignments”
    const isClearAll = !Array.isArray(assignments) || assignments.length === 0;

    // Sanitize and deduplicate
    const seen = new Set();
    const uniqueAssignments = Array.isArray(assignments)
      ? assignments
          .filter((a) => a.container_id)
          .map((a) => ({
            container_id: Number(a.container_id),
            supplier_id: a.supplier_id ? Number(a.supplier_id) : null,
          }))
          .filter((a) => {
            const key = a.container_id;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          })
      : [];

    await db.transaction(async (trx) => {
      // 🧹 Step 1: Clear all existing supplier assignments for this request
      await trx.raw(
        `
        UPDATE farmer_plan_containers AS c
        SET supplier_id = NULL, updated_at = CURRENT_TIMESTAMP
        FROM farmer_plans AS fp
        WHERE fp.id = c.plan_id
          AND fp.request_id = ?
        `,
        [requestId],
      );

      // If we're clearing all, we're done inside trx (no notifications)
      if (isClearAll || uniqueAssignments.length === 0) return;

      // 📋 Preload container_no for the containers we are assigning (for nicer notifications)
      const ids = uniqueAssignments.map((a) => a.container_id);
      const rows = await trx("farmer_plan_containers")
        .whereIn("id", ids)
        .select("id", "container_no");
      const containerNoById = Object.fromEntries(
        rows.map((r) => [r.id, r.container_no]),
      );

      // 🧩 Step 2: Apply new assignments + 🔔 notify each supplier
      for (const { supplier_id, container_id } of uniqueAssignments) {
        if (!supplier_id) continue;

        // Update assignment
        await trx.raw(
          `
          UPDATE farmer_plan_containers AS c
          SET supplier_id = ?, updated_at = CURRENT_TIMESTAMP
          FROM farmer_plans AS fp
          WHERE fp.id = c.plan_id
            AND fp.request_id = ?
            AND c.id = ?
          `,
          [supplier_id, requestId, container_id],
        );

        // 🔔 Notify the supplier about this assignment
        await NotificationService.create(
          supplier_id,
          "request_status_changed",
          requestId,
          {
            status: "تخصیص شده",
            container_id,
            container_no: containerNoById[container_id] ?? null,
          },
          trx, // ensure atomicity with the assignment
        );
      }
    });

    // 🔄 Return fresh state
    const updatedContainers = await db("farmer_plan_containers as c")
      .join("farmer_plans as fp", "fp.id", "c.plan_id")
      .leftJoin("users as u", "c.supplier_id", "u.id")
      .where("fp.request_id", requestId)
      .select(
        "c.id as container_id",
        "c.container_no",
        "c.status as container_status",
        "u.id as supplier_id",
        "u.name as supplier_name",
        "u.mobile as supplier_mobile",
      )
      .orderBy("c.id", "asc");

    const message = isClearAll
      ? "✅ تمام تامین‌کنندگان از این درخواست حذف شدند"
      : "✅ تخصیص تامین‌کنندگان با موفقیت بروزرسانی شد";

    res.json({
      success: true,
      message,
      updatedContainers,
    });
  } catch (err) {
    console.error("assignContainersToSuppliers error:", err);
    res.status(500).json({
      error: err.message || "Failed to assign suppliers",
    });
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

    await db.transaction(async (trx) => {
      const [updated] = await trx("buyer_requests")
        .where({ id })
        .update({ status: "completed", updated_at: trx.fn.now() })
        .returning("*");

      await trx("farmer_plan_containers")
        .whereIn(
          "plan_id",
          trx("farmer_plans").select("id").where("request_id", id),
        )
        .update({ is_completed: true, completed_at: trx.fn.now() });

      await NotificationService.create(updated.buyer_id, "completed", id, {
        request_id: id,
        status: "completed",
      });

      res.json({
        message: "Request and containers marked completed",
        request: updated,
      });
    });
  } catch (err) {
    console.error("completeBuyerRequest error:", err);
    res.status(400).json({ error: err.message });
  }
};

/* -------------------- Toggle In-Progress -------------------- */
export async function toggleInProgress(req, res) {
  try {
    const { id } = req.params;
    const result = await adminService.toggleInProgress(id, req.user.id);
    res.json(result);
  } catch (err) {
    console.error("toggleInProgress error:", err);
    res.status(400).json({ error: err.message });
  }
}
/* -------------------- ADMIN: Mark Container as Completed -------------------- */
export async function markContainerCompleted(req, res) {
  try {
    const { id } = req.params;
    const user = req.user; // assuming authenticate middleware attaches user info

    const result = await adminService.markContainerCompleted(id, user.id);
    res.json(result);
  } catch (err) {
    console.error("markContainerCompleted error:", err);
    res.status(400).json({ error: err.message });
  }
}
/**
 * Get full container details with related buyer request, farmer, supplier, files, and tracking info
 */
export const getContainerById = async (req, res) => {
  try {
    const { id } = req.params;

    // 1️⃣ Get main container with plan + request + user info
    const container = await db("farmer_plan_containers as c")
      .leftJoin("farmer_plans as fp", "c.plan_id", "fp.id")
      .leftJoin("buyer_requests as br", "fp.request_id", "br.id")
      .leftJoin("users as supplier", "c.supplier_id", "supplier.id")
      .leftJoin("users as buyer", "br.buyer_id", "buyer.id")
      .select(
        "c.*", // includes c.plan_date from farmer_plan_containers

        // 🧩 Plan info
        "fp.id as plan_id",
        "fp.plan_date as fp_plan_date", // alias to avoid confusion
        "fp.status as plan_status",

        // 🧾 Buyer Request - include all columns from buyer_requests
        "br.id as buyer_request_id",
        "br.buyer_id",
        "br.status as buyer_request_status",
        "br.reviewed_by",
        "br.reviewed_at",
        "br.created_at as buyer_request_created_at",
        "br.updated_at as buyer_request_updated_at",
        "br.size",
        "br.expiration_date",
        "br.certificates",
        "br.import_country",
        "br.entry_border",
        "br.exit_border",
        "br.preferred_supplier_name",
        "br.preferred_supplier_id",
        "br.packaging",
        "br.egg_type",
        "br.container_amount",
        "br.expiration_days",
        "br.transport_type",
        "br.product_type",
        "br.cartons",
        "br.description",
        "br.creator_id",
        "br.admin_extra_files",
        "br.deadline_start",
        "br.deadline_end",

        // 🏢 Supplier Info
        "supplier.id as supplier_id",
        "supplier.name as supplier_name",
        "supplier.email as supplier_email",
        "supplier.mobile as supplier_mobile",

        // 🧍 Buyer Info
        "buyer.id as buyer_id",
        "buyer.name as buyer_name",
        "buyer.email as buyer_email",
        "buyer.mobile as buyer_mobile",
      )
      .where("c.id", id)
      .first();

    if (!container) {
      return res.status(404).json({ error: "Container not found" });
    }

    // 2️⃣ Get all suppliers assigned to this buyer request
    const buyerSuppliers = await db("buyer_request_suppliers as brs")
      .leftJoin("users as s", "brs.supplier_id", "s.id")
      .select(
        "brs.id",
        "brs.buyer_request_id",
        "brs.supplier_id",
        "brs.share_percentage",
        "brs.assigned_at",
        "s.name as supplier_name",
        "s.email as supplier_email",
      )
      .where("brs.buyer_request_id", container.buyer_request_id);

    // 3️⃣ Fetch all related files for this container
    const files = await db("farmer_plan_files")
      .where("container_id", id)
      .select(
        "id",
        "original_name",
        "mime_type",
        "path",
        "status",
        "review_note",
        "type",
        "created_at",
      )
      .orderBy("created_at", "desc");

    // 4️⃣ Container tracking timeline
    const tracking = await db("container_tracking_statuses as t")
      .leftJoin("users as u", "t.created_by", "u.id")
      .select(
        "t.id",
        "t.status",
        "t.note",
        "t.created_at",
        "u.name as created_by_name",
      )
      .where("t.container_id", id)
      .orderBy("t.created_at", "asc");

    // 5️⃣ Other containers in the same plan
    const siblingContainers = await db("farmer_plan_containers")
      .where("plan_id", container.plan_id)
      .select("id", "container_no", "status", "plan_date");

    // ✅ Final response — everything enriched
    res.json({
      ...container,
      buyer_request_suppliers: buyerSuppliers,
      files,
      tracking,
      sibling_containers: siblingContainers,
    });
  } catch (err) {
    console.error("getContainerById error:", err);
    res.status(500).json({ error: "Failed to fetch container details" });
  }
};

/**
 * Admin import Excel → creates buyer_requests per consignee + containers + suppliers (auto-create if missing)
 * creator_id = Al Jabali Trading and Refrigeration Company
 * Groups ALL files by Customer/Consignee → one buyer_request per consignee
 * Automatically marks containers completed + logs tracking + notifies supplier
 * Automatically creates license key for each new consignee (buyer)
 */
export const importExcelData = async (req, res) => {
  try {
    /* --------------------- Validate input --------------------- */
    if (!req.files || req.files.length === 0)
      throw new Error("No Excel files uploaded");

    const { import_country } = req.body; // optional

    const results = [];

    /* --------------------- Helpers --------------------- */

    const normalizeKeys = (obj) => {
      const normalized = {};
      for (const [key, value] of Object.entries(obj)) {
        let newKey = key
          .toString()
          .trim()
          .toLowerCase()
          .replace(/[.\s/()]+/g, "_")
          .replace(/_+/g, "_")
          .replace(/^_+|_+$/g, "");

        if (newKey === "brand") newKey = "egg_brand";
        if (newKey === "commercial_card") newKey = "trade_card";
        if (newKey === "zip_code") newKey = "zip_code_ex";
        if (newKey === "veterinary_health_certificate_number")
          newKey = "veterinary_health_certificate_no";

        normalized[newKey] = value;
      }
      return normalized;
    };

    const formatDate = (val) => {
      if (!val) return null;
      try {
        if (typeof val === "number") {
          const date = new Date((val - 25569) * 86400 * 1000);
          return date.toISOString().split("T")[0];
        }
        if (typeof val === "string") {
          let str = val.trim();
          if (
            /^\d{4}\/\d{2}\/\d{2}$/.test(str) &&
            (str.startsWith("13") || str.startsWith("14"))
          ) {
            const [jy, jm, jd] = str.split("/").map(Number);
            const g = jalaali.toGregorian(jy, jm, jd);
            return `${g.gy}-${String(g.gm).padStart(2, "0")}-${String(g.gd).padStart(2, "0")}`;
          }
          if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(str)) {
            const [d, m, y] = str.split("/").map(Number);
            const date = new Date(y, m - 1, d);
            return date.toISOString().split("T")[0];
          }
          if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
          const date = new Date(str);
          if (!isNaN(date)) return date.toISOString().split("T")[0];
        }
      } catch {
        return null;
      }
      return null;
    };

    const normalizeCountry = (country) => {
      if (!country) return null;
      const map = {
        قطر: "Qatar",
        عمان: "Oman",
        بحرین: "Bahrain",
        البحرين: "Bahrain",
        البحرین: "Bahrain",
      };
      const trimmed = country.toString().trim();
      if (map[trimmed]) return map[trimmed];
      if (["Qatar", "Oman", "Bahrain"].includes(trimmed)) return trimmed;
      return trimmed;
    };

    const normalizeName = (str) =>
      str ? str.toString().trim().toLowerCase().replace(/\s+/g, " ") : "";

    const getConsigneeName = (row) => {
      const raw =
        row["Customer"] ||
        row["customer"] ||
        row["CUSTOMER"] ||
        row["Consignee"] ||
        row["consignee"] ||
        row["CONSIGNEE"] ||
        null;
      return raw ? raw.toString().trim() : "";
    };

    const generateLicenseKey = () =>
      "BUY-" + crypto.randomBytes(12).toString("hex");

    /* --------------------- Database Transaction --------------------- */
    await db.transaction(async (trx) => {
      /* --------------------- Ensure Main Buyer (creator) Exists --------------------- */
      const mainName = "Al Jabali Trading and Refrigeration Company";
      let buyerUser = await trx("users").where("name", mainName).first();
      const placeholderPassword = await bcrypt.hash("NO_PASSWORD", 10);

      if (!buyerUser) {
        const fakeMobile =
          "09" + Math.floor(100000000 + Math.random() * 900000000);

        [buyerUser] = await trx("users")
          .insert({
            name: mainName,
            mobile: fakeMobile,
            password_hash: placeholderPassword,
            status: "active",
            created_at: trx.fn.now(),
            updated_at: trx.fn.now(),
          })
          .returning("*");
      }

      const roleBuyer = await trx("roles").where("name", "buyer").first();
      const roleUser = await trx("roles").where("name", "user").first();

      await trx("user_roles")
        .insert({ user_id: buyerUser.id, role_id: roleBuyer.id })
        .onConflict(["user_id", "role_id"])
        .ignore();

      /* --------------------- Load all suppliers once --------------------- */
      let suppliers = await trx("users")
        .select("id", "name")
        .where("status", "active");

      /* --------------------- Read ALL files and flatten rows --------------------- */
      const allRows = [];

      for (const file of req.files) {
        const workbook = xlsx.readFile(file.path);
        const sheetName = workbook.SheetNames[0];

        const sheet = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], {
          defval: null,
        });

        if (!sheet.length) continue;

        const derivedCountry =
          import_country ||
          file.originalname.replace(".xlsx", "").replace(".xls", "");
        const finalCountry = normalizeCountry(derivedCountry);

        for (const row of sheet) {
          allRows.push({
            row,
            fileName: file.originalname,
            country: finalCountry,
          });
        }
      }

      if (!allRows.length) throw new Error("Excel sheets are empty");

      /* --------------------- Group by Consignee --------------------- */
      const groups = new Map();

      for (const item of allRows) {
        const consignee = getConsigneeName(item.row);
        if (!consignee) continue;

        const key = normalizeName(consignee);

        if (!groups.has(key)) {
          groups.set(key, { name: consignee, rows: [] });
        }
        groups.get(key).rows.push(item);
      }

      if (groups.size === 0)
        throw new Error("No Customer / Consignee found in Excel");

      /* --------------------- Process Each Consignee --------------------- */
      for (const [key, group] of groups) {
        const consigneeName = group.name;
        const rows = group.rows;

        /* ---- Ensure consignee user exists ---- */
        let consigneeUser = await trx("users")
          .where("name", consigneeName)
          .first();

        if (!consigneeUser) {
          const fakeMobile =
            "09" + Math.floor(100000000 + Math.random() * 900000000);

          [consigneeUser] = await trx("users")
            .insert({
              name: consigneeName,
              mobile: fakeMobile,
              password_hash: placeholderPassword,
              status: "active",
              created_at: trx.fn.now(),
              updated_at: trx.fn.now(),
            })
            .returning("*");

          /* ---------- Create license key ---------- */
          await trx("admin_license_keys").insert({
            key: generateLicenseKey(),
            role_id: roleBuyer.id,
            is_active: true,
            assigned_to: consigneeUser.id,
            created_at: trx.fn.now(),
          });
        }

        /* Ensure buyer role */
        await trx("user_roles")
          .insert({
            user_id: consigneeUser.id,
            role_id: roleBuyer.id,
          })
          .onConflict(["user_id", "role_id"])
          .ignore();

        /* Determine country */
        const countries = [
          ...new Set(rows.map((r) => r.country).filter(Boolean)),
        ];
        const requestCountry =
          countries.length === 1 ? countries[0] : (countries[0] ?? null);

        /* --------------------- Create buyer_request --------------------- */
        const [buyerRequest] = await trx("buyer_requests")
          .insert({
            buyer_id: consigneeUser.id,
            creator_id: buyerUser.id,
            import_country: requestCountry,
            status: "pending",
            container_amount: 0,
            expiration_days: 90,
            product_type: "eggs",
            created_at: trx.fn.now(),
            updated_at: trx.fn.now(),
          })
          .returning("*");

        /* --------------------- Create farmer plan --------------------- */
        const [plan] = await trx("farmer_plans")
          .insert({
            request_id: buyerRequest.id,
            plan_date: trx.fn.now(),
            status: "submitted",
          })
          .returning("*");

        /* --------------------- Create containers --------------------- */
        let index = 1;
        let count = 0;

        for (const item of rows) {
          const row = item.row;

          const shipper =
            row["Shipper"] || row["shipper"] || row["SHIPPER"] || null;

          if (!shipper) continue;

          let supplier = suppliers.find(
            (s) => normalizeName(s.name) === normalizeName(shipper),
          );

          if (!supplier) {
            const fakeMobile =
              "09" + Math.floor(100000000 + Math.random() * 900000000);

            const [newSupplier] = await trx("users")
              .insert({
                name: shipper,
                mobile: fakeMobile,
                password_hash: placeholderPassword,
                status: "active",
                created_at: trx.fn.now(),
                updated_at: trx.fn.now(),
              })
              .returning(["id", "name"]);

            await trx("user_roles")
              .insert({
                user_id: newSupplier.id,
                role_id: roleUser.id,
              })
              .onConflict(["user_id", "role_id"])
              .ignore();

            supplier = newSupplier;
            suppliers.push(newSupplier);
          }

          const normalizedMeta = normalizeKeys(row);

          if (normalizedMeta.ty_number && !normalizedMeta.tracking_code)
            normalizedMeta.tracking_code = normalizedMeta.ty_number;

          for (const key of Object.keys(normalizedMeta)) {
            if (key.includes("date"))
              normalizedMeta[key] = formatDate(normalizedMeta[key]);
          }

          const adminMetadata = {};

          if (row["BL Number"] || row["bl_number"])
            adminMetadata.bl_no = row["BL Number"] || row["bl_number"];

          if (row["BL Date"] || row["bl_date"])
            adminMetadata.bl_date = formatDate(
              row["BL Date"] || row["bl_date"],
            );

          const actualQty =
            row["Actual Quantity Received"] ||
            row["Actual Quantity Recived"] ||
            row["actual_quantity_received"] ||
            row["actual_quantity_recived"];

          if (actualQty) adminMetadata.actual_quantity_received = actualQty;

          const [container] = await trx("farmer_plan_containers")
            .insert({
              plan_id: plan.id,
              container_no: index++,
              buyer_request_id: buyerRequest.id,
              supplier_id: supplier.id,
              metadata: JSON.stringify(normalizedMeta),
              admin_metadata: Object.keys(adminMetadata).length
                ? JSON.stringify(adminMetadata)
                : null,
              tracking_code: normalizedMeta.tracking_code || null,
              farmer_status: "accepted",
              status: "completed",
              is_completed: true,
              in_progress: false,
              completed_at: trx.fn.now(),
              updated_at: trx.fn.now(),
            })
            .returning("*");

          count++;

          await trx("container_tracking_statuses").insert({
            container_id: container.id,
            status: "delivered",
            note: "کانتینر به مقصد تحویل داده شد",
            created_by: buyerUser.id,
            created_at: trx.fn.now(),
          });

          await trx("buyer_request_suppliers")
            .insert({
              buyer_request_id: buyerRequest.id,
              supplier_id: supplier.id,
              container_id: container.id,
              assigned_at: trx.fn.now(),
            })
            .onConflict(["buyer_request_id", "supplier_id", "container_id"])
            .ignore();

          await NotificationService.create(
            supplier.id,
            "container_tracking_update",
            buyerRequest.id,
            {
              status: "delivered",
              containerId: container.id,
              containerNo: container.container_no,
            },
            trx,
          );
        }

        await trx("buyer_requests").where({ id: buyerRequest.id }).update({
          container_amount: count,
          updated_at: trx.fn.now(),
        });

        results.push({
          consignee: consigneeName,
          buyer_request_id: buyerRequest.id,
          import_country: requestCountry,
          containers: count,
        });
      }
    });

    /* --------------------- Final Response --------------------- */
    return res.json({
      message:
        "✅ Excel import completed successfully — grouped by consignee/customer.",
      total_consignees: results.length,
      details: results,
    });
  } catch (err) {
    console.error("❌ importExcelData error:", err);
    res.status(400).json({ error: err.message });
  }
};
