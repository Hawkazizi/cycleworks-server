import db from "../db/knex.js";

/* -------------------- List All Tickets -------------------- */
export async function listTickets({ status }) {
  let query = db("tickets").select("*").orderBy("created_at", "desc");

  if (status) query = query.where({ status });

  return query;
}

/* -------------------- Get Single Ticket + Replies -------------------- */
export async function getTicketWithReplies(ticketId) {
  const ticket = await db("tickets").where({ id: ticketId }).first();
  if (!ticket) throw new Error("تیکت یافت نشد");

  const replies = await db("ticket_replies")
    .where({ ticket_id: ticketId })
    .orderBy("created_at", "asc");

  return { ticket, replies };
}

/* -------------------- Reply to Ticket -------------------- */
export async function replyToTicket({ ticketId, adminId, message, file }) {
  const ticket = await db("tickets").where({ id: ticketId }).first();
  if (!ticket) throw new Error("تیکت یافت نشد");

  const [reply] = await db("ticket_replies")
    .insert({
      ticket_id: ticketId,
      admin_id: adminId,
      message,
      attachment_path: file?.path || null,
      attachment_name: file?.originalname || null,
      attachment_mimetype: file?.mimetype || null,
    })
    .returning("*");

  // update ticket status to answered
  await db("tickets").where({ id: ticketId }).update({ status: "answered" });

  return reply;
}

/* -------------------- Close Ticket -------------------- */
export async function closeTicket(ticketId) {
  const updated = await db("tickets")
    .where({ id: ticketId })
    .update({ status: "closed" })
    .returning("*");
  if (!updated.length) throw new Error("تیکت یافت نشد");
  return updated[0];
}
