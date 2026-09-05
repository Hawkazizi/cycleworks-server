import path from "path";
import fs from "fs";
import db from "../../common/db/knex.js";

import * as customerReqService from "./customerRequest.service.js";
import * as adminService from "../admin/admin.service.js";
import * as customerService from "./customer.service.js";
import * as ticketService from "../ticket/ticket.service.js";
import { ROLES } from "../../common/constants/roles.js";

/* =======================================================================
   👤 CUSTOMER PROFILE MANAGEMENT
======================================================================= */

/** 🔍 Get customer profile */
export async function getProfile(req, res) {
  try {
    const me = await db("users").where({ id: req.user.id }).first();
    if (!me)
      return res.status(404).json({ error: req.t("buyer.profile_not_found") });
    res.json(me);
  } catch (err) {
    console.error("getProfile (customer) error:", err);
    res.status(500).json({ error: req.t("errors.fetch_profile") });
  }
}

/** ✏️ Update customer profile */
export async function updateProfile(req, res) {
  try {
    const updated = await customerService.updateProfile(req.user.id, req.body);
    res.json(updated);
  } catch (err) {
    console.error("updateProfile (customer) error:", err);
    res.status(400).json({ error: err.message });
  }
}

/** 🖼️ Upload customer profile picture */
export const uploadProfilePicture = async (req, res) => {
  try {
    const customerId = req.user.id;
    if (!req.file)
      return res.status(400).json({ error: req.t("errors.no_file") });

    const dir = path.join("uploads", "profiles");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const newFilePath = `/uploads/profiles/${req.file.filename}`;
    fs.renameSync(req.file.path, path.join(dir, req.file.filename));

    // Delete old profile picture
    const customer = await db("users").where({ id: customerId }).first();
    if (customer?.profile_picture) {
      const oldPath = path.join(
        process.cwd(),
        customer.profile_picture.startsWith("/")
          ? customer.profile_picture.slice(1)
          : customer.profile_picture,
      );
      if (fs.existsSync(oldPath)) {
        try {
          fs.unlinkSync(oldPath);
          console.log(`🧹 Deleted old customer profile picture: ${oldPath}`);
        } catch (err) {
          console.warn("⚠ Failed to delete old picture:", err.message);
        }
      }
    }

    await db("users").where({ id: customerId }).update({
      profile_picture: newFilePath,
      updated_at: new Date(),
    });

    res.json({
      message: req.t("buyer.profile_picture_updated"),
      profile_picture: newFilePath,
    });
  } catch (err) {
    console.error("uploadProfilePicture (customer) error:", err);
    res.status(500).json({ error: req.t("errors.upload_picture") });
  }
};

/** 🖼️ Get customer profile picture */
export const getProfilePicture = async (req, res) => {
  try {
    const customerId = req.user.id;

    const customer = await db("users")
      .select("profile_picture")
      .where({ id: customerId })
      .first();

    // ✅ No profile pic set → return 204
    if (!customer?.profile_picture) {
      return res.status(204).end();
    }

    const filePath = path.join(
      process.cwd(),
      customer.profile_picture.startsWith("/")
        ? customer.profile_picture.slice(1)
        : customer.profile_picture,
    );

    // ✅ DB has a path but file missing → also return 204 (or 404 if you prefer)
    if (!fs.existsSync(filePath)) {
      return res.status(204).end();
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
    console.error("getProfilePicture (customer) error:", err);
    res.status(500).json({ error: req.t("errors.fetch_picture") });
  }
};

/** ❌ Delete customer profile */
export const deleteProfile = async (req, res) => {
  try {
    await db.transaction(async (trx) => {
      // Optionally mark related customer requests as cancelled
      await trx("buyer_requests")
        .where({ buyer_id: req.user.id })
        .update({ status: "cancelled", updated_at: trx.fn.now() });

      // Delete customer
      await trx("users").where({ id: req.user.id }).del();
    });
    res.json({ message: req.t("buyer.profile_deleted") });
  } catch (err) {
    console.error("deleteProfile (customer) error:", err);
    res.status(500).json({ error: req.t("errors.delete_profile") });
  }
};

/* =======================================================================
   📦 CUSTOMER REQUEST MANAGEMENT
======================================================================= */

/** 🆕 Create new customer request */
export const createRequest = async (req, res) => {
  try {
    const creatorId = req.user.id;
    const {
      existingCustomerId,
      newCustomer,
      deadline_start,
      deadline_end,
      ...requestData
    } = req.body;

    // Validate deadline order
    if (
      deadline_start &&
      deadline_end &&
      new Date(deadline_start) > new Date(deadline_end)
    ) {
      return res.status(400).json({ error: req.t("buyer.invalid_date_range") });
    }

    const result = await customerReqService.createRequestWithCustomerAndLicense({
      creatorId,
      existingCustomerId,
      newCustomer,
      requestData: {
        ...requestData,
        deadline_start,
        deadline_end,
      },
    });

    res.json(result);
  } catch (err) {
    console.error("❌ createRequest error:", err);
    res.status(400).json({ error: err.message });
  }
};

/** 📋 List customer's own requests */
export async function getMyRequests(req, res) {
  try {
    const { search = "" } = req.query;
    const list = await customerReqService.getMyRequests(
      req.user.id,
      search,
      req.user.roles || [],
    );
    res.json(list);
  } catch (err) {
    console.error("❌ getMyRequests error:", err);
    res.status(500).json({ error: req.t("errors.fetch_requests") });
  }
}

/** 🔍 Get single customer request by ID */
export async function getRequestById(req, res) {
  try {
    const item = await customerReqService.getRequestById(
      req.user.id,
      req.params.id,
    );
    if (!item)
      return res.status(404).json({ error: req.t("buyer.request_not_found") });
    res.json(item);
  } catch (err) {
    console.error("getRequestById error:", err);
    res.status(400).json({ error: req.t("errors.load_request") });
  }
}

/** ✏️ Update customer request */
export async function updateRequest(req, res) {
  try {
    const updated = await customerReqService.updateRequest(
      req.user.id,
      req.params.id,
      req.body,
    );
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

/** ❌ Cancel customer request */
export async function cancelRequest(req, res) {
  try {
    const cancelled = await customerReqService.cancelRequest(
      req.user.id,
      req.params.id,
    );
    res.json(cancelled);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

/* =======================================================================
   🎟️ CUSTOMER TICKETS
======================================================================= */

/** 🆕 Create customer ticket */
export const createCustomerTicket = async (req, res) => {
  try {
    const { subject, message } = req.body;
    const customerId = req.user.id;
    const role = ROLES.CUSTOMER;

    if (!message)
      return res.status(400).json({ error: req.t("ticket.message_required") });

    // Handle optional file upload
    let fileInfo = null;
    if (req.file) {
      const customerDir = path.join(
        "uploads",
        "customers",
        String(customerId),
        "tickets",
      );
      fs.mkdirSync(customerDir, { recursive: true });

      const filePath = path.join(customerDir, req.file.originalname);
      fs.renameSync(req.file.path, filePath);

      fileInfo = {
        path: "/" + filePath.replace(/\\/g, "/"),
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
      };
    }

    const ticket = await ticketService.createTicket({
      userId: customerId,
      role,
      subject,
      message,
      file: fileInfo,
    });

    res.status(201).json({
      message: req.t("ticket.created"),
      ticket,
    });
  } catch (err) {
    console.error("CREATE CUSTOMER TICKET ERROR:", err);
    res.status(400).json({ error: err.message });
  }
};

/** 📋 List customer tickets */
export const getMyCustomerTickets = async (req, res) => {
  try {
    const tickets = await ticketService.getUserTickets(req.user.id);
    res.json(tickets);
  } catch (err) {
    console.error("GET CUSTOMER TICKETS ERROR:", err);
    res.status(400).json({ error: err.message });
  }
};

/** ✏️ Update customer ticket */
export const updateCustomerTicket = async (req, res) => {
  try {
    const ticketId = req.params.id;
    const customerId = req.user.id;
    const { subject, message } = req.body;

    let fileInfo = null;
    if (req.file) {
      const customerDir = path.join(
        "uploads",
        "customers",
        String(customerId),
        "tickets",
      );
      fs.mkdirSync(customerDir, { recursive: true });

      const filePath = path.join(customerDir, req.file.originalname);
      fs.renameSync(req.file.path, filePath);

      fileInfo = {
        path: "/" + filePath.replace(/\\/g, "/"),
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
      };
    }

    const updated = await ticketService.updateTicket({
      ticketId,
      userId: customerId,
      subject,
      message,
      file: fileInfo,
    });

    res.json({
      message: req.t("ticket.updated"),
      ticket: updated,
    });
  } catch (err) {
    console.error("UPDATE CUSTOMER TICKET ERROR:", err);
    res.status(400).json({ error: err.message });
  }
};

/* =======================================================================
   🧰 UTILITIES (LISTS)
======================================================================= */

/** 👥 Minimal user list (all roles) */
export const getMinimalUsers = async (req, res) => {
  try {
    const users = await adminService.getAllUsers();
    res.json(users);
  } catch (err) {
    console.error("Error fetching minimal users:", err);
    res.status(500).json({ error: req.t("errors.fetch_users") });
  }
};

/** 👥 Minimal customer list (active customers only) */
export const getMinimalCustomers = async (req, res) => {
  try {
    const customers = await db("users as u")
      .join("user_roles as ur", "u.id", "ur.user_id")
      .join("roles as r", "ur.role_id", "r.id")
      .whereRaw("LOWER(r.name) = 'buyer'")
      .andWhere("u.status", "active")
      .select("u.id", "u.name", "u.email", "u.mobile")
      .orderBy("u.name", "asc");

    res.json(customers);
  } catch (err) {
    console.error("❌ getMinimalBuyers error:", err);
    res.status(500).json({ error: req.t("errors.fetch_buyers") });
  }
};

/** 👤 List users who have the 'user' role */
export async function listUserRoleUsers(req, res) {
  try {
    const users = await customerService.getUsersWithUserRole();
    res.json(users);
  } catch (err) {
    console.error("Error fetching user-role users:", err);
    res.status(500).json({ message: req.t("errors.fetch_user_role") });
  }
}
