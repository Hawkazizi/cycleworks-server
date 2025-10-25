import path from "path";
import fs from "fs";
import db from "../db/knex.js";
import * as buyerReqService from "../services/buyerRequest.service.js";
import * as adminService from "../services/admin.service.js";
import * as buyerService from "../services/buyer.service.js";
import * as ticketService from "../services/ticket.service.js";

import knex from "../db/knex.js";

export async function getProfile(req, res) {
  const me = await knex("users").where({ id: req.user.id }).first();
  res.json(me);
}

export async function updateProfile(req, res) {
  try {
    const updated = await buyerService.updateProfile(req.user.id, req.body);
    res.json(updated);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
}

//////////////////////////// Reqs ///////////////////////////////////

export const createRequest = async (req, res) => {
  try {
    const creatorId = req.user.id;
    const {
      existingBuyerId,
      newBuyer,
      deadline_start_date,
      deadline_end_date,
      ...requestData
    } = req.body;

    // 🧭 Validate deadline order
    if (
      deadline_start_date &&
      deadline_end_date &&
      new Date(deadline_start_date) > new Date(deadline_end_date)
    ) {
      return res.status(400).json({
        error: "Start date cannot be after end date",
      });
    }

    const result = await buyerReqService.createRequestWithBuyerAndLicense({
      creatorId,
      existingBuyerId,
      newBuyer,
      requestData: {
        ...requestData,
        deadline_start_date,
        deadline_end_date,
      },
    });

    res.json(result);
  } catch (error) {
    console.error("❌ createRequest error:", error);
    res.status(400).json({ error: error.message });
  }
};

export async function getMyRequests(req, res) {
  try {
    const { search = "" } = req.query;
    const userId = req.user.id;
    const roles = req.user.roles || [];

    const list = await buyerReqService.getMyRequests(userId, search, roles);
    res.json(list);
  } catch (error) {
    console.error("❌ getMyRequests error:", error);
    res.status(500).json({ error: "Failed to fetch requests" });
  }
}

export async function getRequestById(req, res) {
  const item = await buyerReqService.getRequestById(req.user.id, req.params.id);
  if (!item) return res.status(404).json({ error: "Not found" });
  res.json(item);
}

export async function updateRequest(req, res) {
  try {
    const updated = await buyerReqService.updateRequest(
      req.user.id,
      req.params.id,
      req.body,
    );
    res.json(updated);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
}

export async function cancelRequest(req, res) {
  try {
    const cancelled = await buyerReqService.cancelRequest(
      req.user.id,
      req.params.id,
    );
    res.json(cancelled);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
}

export const getMinimalUsers = async (req, res) => {
  try {
    const users = await adminService.getAllUsers();
    res.json(users);
  } catch (err) {
    console.error("Error fetching minimal users:", err);
    res.status(500).json({ error: "Failed to fetch users" });
  }
};

/* -------------------- Buyer Tickets -------------------------- */

/* -------------------- Create Buyer Ticket -------------------- */
export const createBuyerTicket = async (req, res) => {
  try {
    const { subject, message } = req.body;
    const buyerId = req.user.id; // from authenticate middleware
    const role = "buyer";

    if (!message) {
      return res.status(400).json({ error: "متن تیکت الزامی است" });
    }

    // handle file upload (if exists)
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
      message: "تیکت با موفقیت ارسال شد",
      ticket,
    });
  } catch (err) {
    console.error("CREATE BUYER TICKET ERROR:", err);
    res.status(400).json({ error: err.message });
  }
};

/* -------------------- List Buyer Tickets -------------------- */
export const getMyBuyerTickets = async (req, res) => {
  try {
    const buyerId = req.user.id;
    const tickets = await ticketService.getUserTickets(buyerId);
    res.json(tickets);
  } catch (err) {
    console.error("GET BUYER TICKETS ERROR:", err);
    res.status(400).json({ error: err.message });
  }
};

/* -------------------- Update Buyer Ticket -------------------- */
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
      message: "تیکت با موفقیت به‌روزرسانی شد",
      ticket: updated,
    });
  } catch (err) {
    console.error("UPDATE BUYER TICKET ERROR:", err);
    res.status(400).json({ error: err.message });
  }
};

////////////Extras
export const getMinimalBuyers = async (req, res) => {
  try {
    const buyers = await db("users as u")
      .join("user_roles as ur", "u.id", "ur.user_id")
      .join("roles as r", "ur.role_id", "r.id")
      .where("r.name", "buyer") // ✅ only buyers
      .andWhere("u.status", "active")
      .select("u.id", "u.name", "u.email", "u.mobile")
      .orderBy("u.name", "asc");

    res.json(buyers);
  } catch (error) {
    console.error("❌ getMinimalBuyers error:", error);
    res.status(500).json({ error: "Failed to fetch buyers list" });
  }
};

export async function listUserRoleUsers(req, res) {
  try {
    const users = await buyerService.getUsersWithUserRole();
    res.json(users);
  } catch (err) {
    console.error("Error fetching user-role users:", err);
    res.status(500).json({ message: "Failed to fetch users with 'user' role" });
  }
}
