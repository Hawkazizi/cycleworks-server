import db from "../db/knex.js";

/* -------------------- Create Ticket -------------------- */
export async function createTicket({ userId, role, subject, message, file }) {
  const [ticket] = await db("tickets")
    .insert({
      user_id: userId,
      role,
      subject,
      message,
      attachment_path: file?.path || null,
      attachment_name: file?.originalname || null,
      attachment_mimetype: file?.mimetype || null,
      status: "open",
    })
    .returning("*");

  return ticket;
}

/* -------------------- Get User Tickets -------------------- */
export async function getUserTickets(userId) {
  // fetch all tickets belonging to this user
  const tickets = await db("tickets")
    .where({ user_id: userId })
    .orderBy("created_at", "desc");

  // attach replies to each ticket
  for (const t of tickets) {
    const replies = await db("ticket_replies")
      .where({ ticket_id: t.id })
      .orderBy("created_at", "asc")
      .select(
        "id",
        "ticket_id",
        "admin_id",
        "message",
        "attachment_path",
        "attachment_name",
        "attachment_mimetype",
        "created_at"
      );

    // mark replies as admin responses
    t.responses = replies.map((r) => ({
      ...r,
      sender_role: "admin",
    }));
  }

  return tickets;
}

/* -------------------- Update User Ticket -------------------- */
export async function updateTicket({
  ticketId,
  userId,
  subject,
  message,
  file,
}) {
  const ticket = await db("tickets")
    .where({ id: ticketId, user_id: userId })
    .first();
  if (!ticket) throw new Error("تیکت یافت نشد");
  if (ticket.status !== "open")
    throw new Error("فقط تیکت‌های باز قابل ویرایش هستند");

  const updates = {
    subject: subject ?? ticket.subject,
    message: message ?? ticket.message,
    updated_at: new Date(),
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
