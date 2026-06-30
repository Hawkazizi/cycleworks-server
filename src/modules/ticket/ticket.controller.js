import fs from "fs";
import path from "path";
import * as ticketService from "./ticket.service.js";

// you already have authorize middleware; we'll use req.user.roles
function isAdminLike(req) {
  const roles = req.user?.roles || [];
  return roles.includes("admin") || roles.includes("manager");
}

function moveUpload(req, baseDir) {
  if (!req.file) return null;

  fs.mkdirSync(baseDir, { recursive: true });

  const filePath = path.join(baseDir, req.file.originalname);
  fs.renameSync(req.file.path, filePath);

  return {
    path: "/" + filePath.replace(/\\/g, "/"),
    originalname: req.file.originalname,
    mimetype: req.file.mimetype,
  };
}

function deleteFileIfExists(filePath) {
  if (!filePath) return;
  const fullPath = path.join(process.cwd(), filePath.replace(/^\//, ""));
  if (fs.existsSync(fullPath)) {
    try {
      fs.unlinkSync(fullPath);
    } catch {
      // ignore
    }
  }
}

/** POST /tickets */
export const createTicket = async (req, res) => {
  try {
    const { subject, message, assignedTo } = req.body;
    if (!message)
      return res
        .status(400)
        .json({ error: req.t("validation.message_required") });

    const userId = req.user.id;
    const role = (req.user.roles && req.user.roles[0]) || "user";

    const dir = path.join("uploads", "users", String(userId), "tickets");
    const fileInfo = moveUpload(req, dir);

    const ticket = await ticketService.createTicket({
      createdBy: userId,
      assignedTo: assignedTo ? Number(assignedTo) : null,
      role,
      subject,
      message,
      file: fileInfo,
    });

    res.status(201).json({ message: req.t("ticket.created"), ticket });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

/** GET /tickets (my inbox+sent) */
export async function listMyTickets(req, res) {
  try {
    const { status } = req.query;
    const tickets = await ticketService.listMyTickets({
      userId: req.user.id,
      status: status && status !== "all" ? status : undefined,
    });
    res.json(tickets);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
}

/** GET /tickets/admin (admin: list all) */
export const listAllTickets = async (req, res) => {
  try {
    const { status } = req.query;
    const tickets = await ticketService.listAllTickets({ status });
    res.json(tickets);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

/** GET /tickets/:id */
export async function getTicketThread(req, res) {
  try {
    const ticketId = Number(req.params.id);
    const data = await ticketService.getTicketThread({
      ticketId,
      userId: req.user.id,
      isAdmin: false, // ✅ IMPORTANT
    });
    res.json(data);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
}

/** POST /tickets/:id/replies */
export const replyToTicket = async (req, res) => {
  try {
    const ticketId = Number(req.params.id);
    const { message } = req.body;
    if (!message)
      return res
        .status(400)
        .json({ error: req.t("validation.reply_required") });

    const userId = req.user.id;

    const dir = path.join("uploads", "users", String(userId), "ticket_replies");
    const fileInfo = moveUpload(req, dir);

    const reply = await ticketService.replyToTicket({
      ticketId,
      userId,
      message,
      file: fileInfo, // ✅ FIX HERE
      isAdmin: false,
    });

    res.status(201).json({ message: req.t("ticket.reply_success"), reply });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

/** PATCH /tickets/:id */
export const updateTicket = async (req, res) => {
  try {
    const ticketId = Number(req.params.id);
    const { subject, message } = req.body;

    const userId = req.user.id;
    const dir = path.join("uploads", "users", String(userId), "tickets");
    const fileInfo = moveUpload(req, dir);

    const updated = await ticketService.updateTicket({
      ticketId,
      userId,
      subject,
      message,
      file: fileInfo,
    });

    res.json({ message: req.t("ticket.updated"), ticket: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

/** PATCH /tickets/:id/close */
export const closeTicket = async (req, res) => {
  try {
    const ticketId = Number(req.params.id);

    const updated = await ticketService.closeTicket({
      ticketId,
      userId: req.user.id,
      isAdmin: false, // ✅
    });

    res.json({ message: req.t("ticket.closed"), ticket: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

/** DELETE /tickets/:id (admin/manager only) */
export const deleteTicket = async (req, res) => {
  try {
    if (!isAdminLike(req)) {
      return res.status(403).json({ error: req.t("auth.unauthorized") });
    }

    const ticketId = Number(req.params.id);

    // delete DB records first but return paths for cleanup
    const { ticket, replies } = await ticketService.deleteTicketAsAdmin({
      ticketId,
    });

    // delete files
    deleteFileIfExists(ticket.attachment_path);
    replies.forEach((r) => deleteFileIfExists(r.attachment_path));

    res.json({ message: req.t("ticket.deleted") });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// controllers/ticket.controller.js
export const listRecipients = async (req, res) => {
  try {
    // robust boolean parsing
    const includeInactive =
      String(req.query.includeInactive ?? "true") !== "false";
    const excludeSelf = String(req.query.excludeSelf ?? "true") !== "false";

    // pagination + search
    const q = String(req.query.q ?? "").trim(); // search term
    const page = Math.max(1, Number(req.query.page ?? 1));
    const limitRaw = Number(req.query.limit ?? 50);
    const limit = Math.min(200, Math.max(1, limitRaw)); // clamp 1..200
    const offset = (page - 1) * limit;

    const { users, total } = await ticketService.listTicketRecipients({
      currentUserId: req.user?.id,
      includeInactive,
      excludeSelf,
      q,
      limit,
      offset,
    });

    // Helpful in prod debugging + UI
    res.setHeader("X-Total-Count", String(total));
    res.setHeader("Cache-Control", "private, max-age=60"); // optional (user-specific)

    res.json({
      users,
      meta: {
        total,
        page,
        limit,
        hasMore: offset + users.length < total,
        q,
        includeInactive,
        excludeSelf,
      },
    });
  } catch (err) {
    // IMPORTANT: log server-side to find prod-only issues
    console.error("listRecipients failed:", {
      message: err.message,
      stack: err.stack,
      userId: req.user?.id,
      query: req.query,
    });
    res.status(400).json({ error: err.message });
  }
};
