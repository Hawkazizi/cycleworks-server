// controllers/admin.controller.js
import * as adminService from "../services/admin.service.js";
import * as adminBuyerService from "../services/adminBuyer.service.js";
import * as adminReportService from "../services/adminReport.service.js";
import * as adminFarmerPlansService from "../services/adminFarmerPlans.service.js";
import * as adminTicketService from "../services/adminTicket.service.js";
import db from "../db/knex.js";
import path from "path";
import fs from "fs";
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
      role
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
    res.status(404).json({ error: err.message });
  }
};

export const updateProfile = async (req, res) => {
  try {
    const adminUserId = req.user.id;
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: "Name is required" });

    const updated = await adminService.updateAdminProfile(adminUserId, {
      name,
    });
    res.json({ admin: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
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
      adminId
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
    const user = await db("users")
      .select("id", "name", "email", "status")
      .where({ id })
      .first();

    if (!user) return res.status(404).json({ error: "User not found" });

    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
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
        "*"
      );

    return res.json(updated[0]);
  } catch (err) {
    console.error("updateBuyerRequest error:", err);
    return res.status(500).json({ error: "خطا در بروزرسانی درخواست." });
  }
}
export async function completeRequest(req, res) {
  try {
    const { id } = req.params;

    const [updated] = await db("buyer_requests")
      .where({ id })
      .update({ final_status: "completed", updated_at: db.fn.now() })
      .returning("*");

    res.json({ message: "Request completed and sent to buyer", updated });
  } catch (err) {
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
      reviewerId
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
      reviewerId
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
        "ticket_replies"
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
