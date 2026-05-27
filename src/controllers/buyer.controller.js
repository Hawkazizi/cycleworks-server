import path from "path";
import fs from "fs";
import db from "../db/knex.js";

import * as buyerReqService from "../services/buyerRequest.service.js";
import * as adminService from "../services/admin.service.js";
import * as buyerService from "../services/buyer.service.js";
import * as ticketService from "../services/ticket.service.js";

/* =======================================================================
   👤 BUYER PROFILE MANAGEMENT
======================================================================= */

/** 🔍 Get buyer profile */
export async function getProfile(req, res) {
  try {
    const me = await db("users").where({ id: req.user.id }).first();
    if (!me)
      return res.status(404).json({ error: req.t("buyer.profile_not_found") });
    res.json(me);
  } catch (err) {
    console.error("getProfile (buyer) error:", err);
    res.status(500).json({ error: req.t("errors.fetch_profile") });
  }
}

/** ✏️ Update buyer profile */
export async function updateProfile(req, res) {
  try {
    const updated = await buyerService.updateProfile(req.user.id, req.body);
    res.json(updated);
  } catch (err) {
    console.error("updateProfile (buyer) error:", err);
    res.status(400).json({ error: err.message });
  }
}

/** 🖼️ Upload buyer profile picture */
export const uploadProfilePicture = async (req, res) => {
  try {
    const buyerId = req.user.id;
    if (!req.file)
      return res.status(400).json({ error: req.t("errors.no_file") });

    const dir = path.join("uploads", "profiles");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const newFilePath = `/uploads/profiles/${req.file.filename}`;
    fs.renameSync(req.file.path, path.join(dir, req.file.filename));

    // Delete old profile picture
    const buyer = await db("users").where({ id: buyerId }).first();
    if (buyer?.profile_picture) {
      const oldPath = path.join(
        process.cwd(),
        buyer.profile_picture.startsWith("/")
          ? buyer.profile_picture.slice(1)
          : buyer.profile_picture,
      );
      if (fs.existsSync(oldPath)) {
        try {
          fs.unlinkSync(oldPath);
          console.log(`🧹 Deleted old buyer profile picture: ${oldPath}`);
        } catch (err) {
          console.warn("⚠ Failed to delete old picture:", err.message);
        }
      }
    }

    await db("users").where({ id: buyerId }).update({
      profile_picture: newFilePath,
      updated_at: new Date(),
    });

    res.json({
      message: req.t("buyer.profile_picture_updated"),
      profile_picture: newFilePath,
    });
  } catch (err) {
    console.error("uploadProfilePicture (buyer) error:", err);
    res.status(500).json({ error: req.t("errors.upload_picture") });
  }
};

/** 🖼️ Get buyer profile picture */
export const getProfilePicture = async (req, res) => {
  try {
    const buyerId = req.user.id;

    const buyer = await db("users")
      .select("profile_picture")
      .where({ id: buyerId })
      .first();

    // ✅ No profile pic set → return 204
    if (!buyer?.profile_picture) {
      return res.status(204).end();
    }

    const filePath = path.join(
      process.cwd(),
      buyer.profile_picture.startsWith("/")
        ? buyer.profile_picture.slice(1)
        : buyer.profile_picture,
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
    console.error("getProfilePicture (buyer) error:", err);
    res.status(500).json({ error: req.t("errors.fetch_picture") });
  }
};

/** ❌ Delete buyer profile */
export const deleteProfile = async (req, res) => {
  try {
    await db.transaction(async (trx) => {
      // Optionally mark related buyer requests as cancelled
      await trx("buyer_requests")
        .where({ buyer_id: req.user.id })
        .update({ status: "cancelled", updated_at: trx.fn.now() });

      // Delete buyer
      await trx("users").where({ id: req.user.id }).del();
    });
    res.json({ message: req.t("buyer.profile_deleted") });
  } catch (err) {
    console.error("deleteProfile (buyer) error:", err);
    res.status(500).json({ error: req.t("errors.delete_profile") });
  }
};

/* =======================================================================
   📦 BUYER REQUEST MANAGEMENT
======================================================================= */

/** 🆕 Create new buyer request */
export const createRequest = async (req, res) => {
  try {
    const creatorId = req.user.id;
    const {
      existingBuyerId,
      newBuyer,
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

    const result = await buyerReqService.createRequestWithBuyerAndLicense({
      creatorId,
      existingBuyerId,
      newBuyer,
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

/** 📋 List buyer's own requests */
export async function getMyRequests(req, res) {
  try {
    const { search = "" } = req.query;
    const list = await buyerReqService.getMyRequests(
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

/** 🔍 Get single buyer request by ID */
export async function getRequestById(req, res) {
  try {
    const item = await buyerReqService.getRequestById(
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

/** ✏️ Update buyer request */
export async function updateRequest(req, res) {
  try {
    const updated = await buyerReqService.updateRequest(
      req.user.id,
      req.params.id,
      req.body,
    );
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

/** ❌ Cancel buyer request */
export async function cancelRequest(req, res) {
  try {
    const cancelled = await buyerReqService.cancelRequest(
      req.user.id,
      req.params.id,
    );
    res.json(cancelled);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

/* =======================================================================
   🎟️ BUYER TICKETS
======================================================================= */

/** 🆕 Create buyer ticket */
export const createBuyerTicket = async (req, res) => {
  try {
    const { subject, message } = req.body;
    const buyerId = req.user.id;
    const role = "buyer";

    if (!message)
      return res.status(400).json({ error: req.t("ticket.message_required") });

    // Handle optional file upload
    let fileInfo = null;
    if (req.file) {
      const buyerDir = path.join(
        "uploads",
        "buyers",
        String(buyerId),
        "tickets",
      );
      fs.mkdirSync(buyerDir, { recursive: true });

      const filePath = path.join(buyerDir, req.file.originalname);
      fs.renameSync(req.file.path, filePath);

      fileInfo = {
        path: "/" + filePath.replace(/\\/g, "/"),
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
      };
    }

    const ticket = await ticketService.createTicket({
      userId: buyerId,
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
    console.error("CREATE BUYER TICKET ERROR:", err);
    res.status(400).json({ error: err.message });
  }
};

/** 📋 List buyer tickets */
export const getMyBuyerTickets = async (req, res) => {
  try {
    const tickets = await ticketService.getUserTickets(req.user.id);
    res.json(tickets);
  } catch (err) {
    console.error("GET BUYER TICKETS ERROR:", err);
    res.status(400).json({ error: err.message });
  }
};

/** ✏️ Update buyer ticket */
export const updateBuyerTicket = async (req, res) => {
  try {
    const ticketId = req.params.id;
    const buyerId = req.user.id;
    const { subject, message } = req.body;

    let fileInfo = null;
    if (req.file) {
      const buyerDir = path.join(
        "uploads",
        "buyers",
        String(buyerId),
        "tickets",
      );
      fs.mkdirSync(buyerDir, { recursive: true });

      const filePath = path.join(buyerDir, req.file.originalname);
      fs.renameSync(req.file.path, filePath);

      fileInfo = {
        path: "/" + filePath.replace(/\\/g, "/"),
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
      };
    }

    const updated = await ticketService.updateTicket({
      ticketId,
      userId: buyerId,
      subject,
      message,
      file: fileInfo,
    });

    res.json({
      message: req.t("ticket.updated"),
      ticket: updated,
    });
  } catch (err) {
    console.error("UPDATE BUYER TICKET ERROR:", err);
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

/** 👥 Minimal buyer list (active buyers only) */
export const getMinimalBuyers = async (req, res) => {
  try {
    const buyers = await db("users as u")
      .join("user_roles as ur", "u.id", "ur.user_id")
      .join("roles as r", "ur.role_id", "r.id")
      .whereRaw("LOWER(r.name) = 'buyer'")
      .andWhere("u.status", "active")
      .select("u.id", "u.name", "u.email", "u.mobile")
      .orderBy("u.name", "asc");

    res.json(buyers);
  } catch (err) {
    console.error("❌ getMinimalBuyers error:", err);
    res.status(500).json({ error: req.t("errors.fetch_buyers") });
  }
};

/** 👤 List users who have the 'user' role */
export async function listUserRoleUsers(req, res) {
  try {
    const users = await buyerService.getUsersWithUserRole();
    res.json(users);
  } catch (err) {
    console.error("Error fetching user-role users:", err);
    res.status(500).json({ message: req.t("errors.fetch_user_role") });
  }
}
