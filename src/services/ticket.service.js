import db from "../db/knex.js";

/* =========================
   Helpers
========================= */
function normalizeReplyAuthor(r) {
  return {
    ...r,
    author_id: r.author_id ?? r.admin_id ?? null, // legacy fallback
  };
}

async function isRecipient(ticketId, userId) {
  const row = await db("ticket_recipients")
    .where({ ticket_id: ticketId, user_id: userId })
    .first();
  return !!row;
}

/* =========================
   Create Ticket
   - created_by: sender (required)
   - assigned_to: receiver (nullable for "support queue" if you want)
========================= */
export async function createTicket({
  createdBy,
  assignedTo = null,
  role,
  subject,
  message,
  file,
}) {
  const [ticket] = await db("tickets")
    .insert({
      user_id: createdBy, // legacy
      role,

      created_by: createdBy,
      assigned_to: assignedTo, // keep for non-user flows

      subject,
      message,
      attachment_path: file?.path || null,
      attachment_name: file?.originalname || null,
      attachment_mimetype: file?.mimetype || null,
      status: "open",
      last_message_at: db.fn.now(),
    })
    .returning("*");

  // ✅ "user" auto recipients
  if (role === "user") {
    const recipientIds = await getUsersByRoles(["buyer", "admin", "manager"], {
      includeInactive: true,
    });

    const filtered = recipientIds.filter((id) => id !== createdBy);

    if (filtered.length) {
      await db("ticket_recipients")
        .insert(filtered.map((user_id) => ({ ticket_id: ticket.id, user_id })))
        .onConflict(["ticket_id", "user_id"])
        .ignore();
    }

    // optional: keep assigned_to null for user tickets
    await db("tickets").where({ id: ticket.id }).update({ assigned_to: null });
  } else {
    // non-user roles can still have 1 selected recipient
    if (assignedTo) {
      await db("ticket_recipients")
        .insert({ ticket_id: ticket.id, user_id: assignedTo })
        .onConflict(["ticket_id", "user_id"])
        .ignore();
    }
  }

  return ticket;
}

/* =========================
   List My Tickets
   - inbox: assigned_to = me
   - sent: created_by = me
========================= */
export async function listMyTickets({ userId, status }) {
  const q = db("tickets as t")
    .leftJoin("ticket_recipients as tr", "tr.ticket_id", "t.id")
    .where((qb) => {
      qb.where("t.created_by", userId)
        .orWhere("t.user_id", userId) // legacy
        .orWhere("tr.user_id", userId);
    })
    .groupBy("t.id")
    .orderBy("t.last_message_at", "desc")
    .select("t.*");

  if (status) q.andWhere("t.status", status);

  return q;
}
/* =========================
   Admin list all tickets (optionally by status)
========================= */
export async function listAllTickets({ status }) {
  const q = db("tickets").orderBy("last_message_at", "desc");
  if (status) q.where({ status });
  return q.select("*");
}

/* =========================
   Get Thread (ticket + replies) with access control
========================= */
export async function getTicketThread({ ticketId, userId, isAdmin = false }) {
  const ticket = await db("tickets").where({ id: ticketId }).first();
  if (!ticket) throw new Error("تیکت یافت نشد");

  if (!isAdmin) {
    const allowed =
      ticket.created_by === userId ||
      ticket.user_id === userId || // legacy
      (await isRecipient(ticketId, userId));

    if (!allowed) throw new Error("شما اجازه مشاهده این تیکت را ندارید");
  }

  const replies = await db("ticket_replies")
    .where({ ticket_id: ticketId })
    .orderBy("created_at", "asc")
    .select(
      "id",
      "ticket_id",
      "author_id",
      "admin_id",
      "message",
      "attachment_path",
      "attachment_name",
      "attachment_mimetype",
      "created_at",
    );

  return { ticket, replies: replies.map(normalizeReplyAuthor) };
}
/* =========================
   Reply (sender or receiver; admin can reply to any)
========================= */
export async function replyToTicket({
  ticketId,
  userId,
  message,
  file,
  isAdmin = false,
}) {
  const ticket = await db("tickets").where({ id: ticketId }).first();
  if (!ticket) throw new Error("تیکت یافت نشد");
  if (ticket.status === "closed") throw new Error("این تیکت بسته شده است");

  if (!isAdmin) {
    const allowed =
      ticket.created_by === userId ||
      ticket.user_id === userId ||
      (await isRecipient(ticketId, userId));
    if (!allowed) throw new Error("شما اجازه پاسخ به این تیکت را ندارید");
  }

  const [reply] = await db("ticket_replies")
    .insert({
      ticket_id: ticketId,
      author_id: userId,
      message,
      attachment_path: file?.path || null,
      attachment_name: file?.originalname || null,
      attachment_mimetype: file?.mimetype || null,
    })
    .returning("*");

  await db("tickets").where({ id: ticketId }).update({
    status: "answered",
    updated_at: db.fn.now(),
    last_message_at: db.fn.now(),
  });

  return normalizeReplyAuthor(reply);
}
/* =========================
   Update Ticket (creator only)
   - only open
   - optional: block edits after first reply
========================= */
export async function updateTicket({
  ticketId,
  userId,
  subject,
  message,
  file,
}) {
  const ticket = await db("tickets").where({ id: ticketId }).first();
  if (!ticket) throw new Error("تیکت یافت نشد");

  const isCreator = ticket.created_by === userId || ticket.user_id === userId;
  if (!isCreator) throw new Error("فقط ایجادکننده تیکت می‌تواند ویرایش کند");

  if (ticket.status !== "open")
    throw new Error("فقط تیکت‌های باز قابل ویرایش هستند");

  // Optional: prevent editing once any reply exists
  const hasReplies = await db("ticket_replies")
    .where({ ticket_id: ticketId })
    .first();

  if (hasReplies)
    throw new Error("پس از دریافت پاسخ، ویرایش تیکت امکان‌پذیر نیست");

  const updates = {
    subject: subject ?? ticket.subject,
    message: message ?? ticket.message,
    updated_at: db.fn.now(),
    last_message_at: db.fn.now(),
  };

  if (file) {
    updates.attachment_path = file.path;
    updates.attachment_name = file.originalname;
    updates.attachment_mimetype = file.mimetype;
  }

  const [updated] = await db("tickets")
    .where({ id: ticketId })
    .update(updates)
    .returning("*");

  return updated;
}

/* =========================
   Close Ticket (sender or receiver; admin can close any)
========================= */
export async function closeTicket({ ticketId, userId, isAdmin = false }) {
  const ticket = await db("tickets").where({ id: ticketId }).first();
  if (!ticket) throw new Error("تیکت یافت نشد");

  if (!isAdmin) {
    const allowed =
      ticket.created_by === userId ||
      ticket.user_id === userId ||
      (await isRecipient(ticketId, userId));

    if (!allowed) throw new Error("شما اجازه بستن این تیکت را ندارید");
  }

  const [updated] = await db("tickets")
    .where({ id: ticketId })
    .update({
      status: "closed",
      updated_at: db.fn.now(),
      last_message_at: db.fn.now(),
    })
    .returning("*");

  return updated;
}
/* =========================
   Delete Ticket (admin only)
   - also deletes attachments
========================= */
export async function deleteTicketAsAdmin({ ticketId }) {
  const ticket = await db("tickets").where({ id: ticketId }).first();
  if (!ticket) throw new Error("تیکت یافت نشد");

  const replies = await db("ticket_replies").where({ ticket_id: ticketId });

  // NOTE: service should not touch filesystem in an ideal architecture,
  // but to match your current behavior, controller will delete files instead.
  // So here we only delete DB records.

  await db("ticket_replies").where({ ticket_id: ticketId }).del();
  await db("tickets").where({ id: ticketId }).del();

  return { ticket, replies };
}

/**
 * Returns all users with their roles (as an array).
 * - excludes current user by default (so you can't message yourself)
 * - optional: includeInactive=false
 */
export async function listTicketRecipients({
  currentUserId,
  includeInactive = true,
  excludeSelf = true,
} = {}) {
  // Postgres: aggregate role names into an array
  // NOTE: We use raw for array_agg / filter.
  let q = db("users as u")
    .leftJoin("user_roles as ur", "ur.user_id", "u.id")
    .leftJoin("roles as r", "r.id", "ur.role_id")
    .select(
      "u.id",
      "u.name",
      "u.email",
      "u.mobile",
      "u.status",
      "u.profile_picture",
      db.raw(
        `COALESCE(
           ARRAY_AGG(DISTINCT r.name) FILTER (WHERE r.name IS NOT NULL),
           '{}'
         ) AS roles`,
      ),
    )
    .groupBy("u.id")
    .orderBy("u.id", "asc");

  if (!includeInactive) q = q.where("u.status", "active");
  if (excludeSelf && currentUserId) q = q.whereNot("u.id", currentUserId);

  const users = await q;

  // Normalize: roles sometimes comes back as string in some drivers; usually it's array already.
  return users.map((u) => ({
    ...u,
    roles: Array.isArray(u.roles) ? u.roles : [],
  }));
}
async function getUsersByRoles(
  roleNames = [],
  { includeInactive = true } = {},
) {
  let q = db("users as u")
    .join("user_roles as ur", "ur.user_id", "u.id")
    .join("roles as r", "r.id", "ur.role_id")
    .whereIn("r.name", roleNames)
    .select("u.id")
    .groupBy("u.id");

  if (!includeInactive) q = q.where("u.status", "active");

  const rows = await q;
  return rows.map((x) => x.id);
}
