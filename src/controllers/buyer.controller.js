import path from "path";
import fs from "fs";
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

export async function createRequest(req, res) {
  try {
    const request = await buyerReqService.createRequest(req.user.id, req.body);
    res.json(request);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
}

export async function getMyRequests(req, res) {
  const list = await buyerReqService.getMyRequests(req.user.id);
  res.json(list);
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
      req.body
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
      req.params.id
    );
    res.json(cancelled);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
}

export async function getMyRequestHistory(req, res) {
  const list = await buyerReqService.getMyRequestHistory(req.user.id);
  res.json(list);
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
        "tickets"
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
        "tickets"
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
