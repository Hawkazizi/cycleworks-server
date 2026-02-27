// services/superAdmin/superadminTickets.service.js
import db from "../../db/knex.js"; // ✅ adjust path to your knex instance

function toInt(v, d) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
}

/**
 * CTE that normalizes "ticket activity" into:
 *   (user_id, ticket_id, last_activity_at)
 *
 * A user is "active" if they appear in:
 * - tickets.user_id
 * - tickets.created_by
 * - tickets.assigned_to
 * - ticket_recipients.user_id
 * - ticket_replies.author_id
 * - ticket_replies.admin_id
 */
function activityCteSQL() {
  return `
    WITH ua AS (
      SELECT t.user_id       AS user_id, t.id AS ticket_id, t.last_message_at AS last_activity_at
      FROM tickets t
      WHERE t.user_id IS NOT NULL

      UNION ALL
      SELECT t.created_by    AS user_id, t.id AS ticket_id, t.last_message_at AS last_activity_at
      FROM tickets t
      WHERE t.created_by IS NOT NULL

      UNION ALL
      SELECT t.assigned_to   AS user_id, t.id AS ticket_id, t.last_message_at AS last_activity_at
      FROM tickets t
      WHERE t.assigned_to IS NOT NULL

      UNION ALL
      SELECT tr.user_id      AS user_id, tr.ticket_id AS ticket_id, t.last_message_at AS last_activity_at
      FROM ticket_recipients tr
      JOIN tickets t ON t.id = tr.ticket_id

      UNION ALL
      SELECT r.author_id     AS user_id, r.ticket_id AS ticket_id, t.last_message_at AS last_activity_at
      FROM ticket_replies r
      JOIN tickets t ON t.id = r.ticket_id
      WHERE r.author_id IS NOT NULL

      UNION ALL
      SELECT r.admin_id      AS user_id, r.ticket_id AS ticket_id, t.last_message_at AS last_activity_at
      FROM ticket_replies r
      JOIN tickets t ON t.id = r.ticket_id
      WHERE r.admin_id IS NOT NULL
    )
  `;
}

/**
 * List all users that have tickets or ticket-related activity.
 * Includes tickets_count + last_activity_at for sorting.
 */
export async function listTicketUsers({ q, page, pageSize } = {}) {
  const p = toInt(page, 1);
  const ps = toInt(pageSize, 20);
  const offset = (p - 1) * ps;

  const search = (q || "").trim().toLowerCase();

  // Use raw SQL for clean CTE + aggregations
  const baseSQL = `
    ${activityCteSQL()}
    SELECT
      u.id,
      u.name,
      u.mobile,
      u.email,
      COUNT(DISTINCT ua.ticket_id) AS tickets_count,
      MAX(ua.last_activity_at)     AS last_activity_at
    FROM ua
    JOIN users u ON u.id = ua.user_id
    ${search ? `WHERE (LOWER(COALESCE(u.name,'')) LIKE ? OR LOWER(COALESCE(u.mobile,'')) LIKE ? OR LOWER(COALESCE(u.email,'')) LIKE ?)` : ""}
    GROUP BY u.id
    ORDER BY last_activity_at DESC NULLS LAST
    LIMIT ?
    OFFSET ?;
  `;

  const bindings = [];
  if (search) {
    const like = `%${search}%`;
    bindings.push(like, like, like);
  }
  bindings.push(ps, offset);

  const rows = await db.raw(baseSQL, bindings).then((r) => r.rows);

  // Total count
  const countSQL = `
    ${activityCteSQL()}
    SELECT COUNT(*)::int AS total
    FROM (
      SELECT u.id
      FROM ua
      JOIN users u ON u.id = ua.user_id
      ${search ? `WHERE (LOWER(COALESCE(u.name,'')) LIKE ? OR LOWER(COALESCE(u.mobile,'')) LIKE ? OR LOWER(COALESCE(u.email,'')) LIKE ?)` : ""}
      GROUP BY u.id
    ) x;
  `;

  const countBindings = [];
  if (search) {
    const like = `%${search}%`;
    countBindings.push(like, like, like);
  }

  const total = await db
    .raw(countSQL, countBindings)
    .then((r) => r.rows?.[0]?.total || 0);

  return {
    items: rows.map((r) => ({
      id: r.id,
      name: r.name,
      mobile: r.mobile,
      email: r.email,
      ticketsCount: Number(r.tickets_count || 0),
      lastActivityAt: r.last_activity_at,
    })),
    page: p,
    pageSize: ps,
    total,
  };
}

/**
 * Returns ALL tickets related to the given user across ALL roles:
 * - ticket.user_id
 * - ticket.created_by
 * - ticket.assigned_to
 * - exists in ticket_recipients
 * - exists in ticket_replies (author_id/admin_id)
 */
export async function listUserTickets({
  userId,
  status,
  q,
  page,
  pageSize,
} = {}) {
  const uid = Number(userId);
  if (!Number.isFinite(uid)) throw new Error("Invalid userId");

  const p = toInt(page, 1);
  const ps = toInt(pageSize, 20);
  const offset = (p - 1) * ps;

  const search = (q || "").trim().toLowerCase();
  const st = (status || "").trim();

  const ticketsQuery = db("tickets as t")
    .select(
      "t.id",
      "t.subject",
      "t.message",
      "t.status",
      "t.role",
      "t.user_id",
      "t.created_by",
      "t.assigned_to",
      "t.last_message_at",
      "t.created_at",
      "t.updated_at",
      "t.attachment_path",
      "t.attachment_name",
      "t.attachment_mimetype",
      db.raw("creator.name as created_by_name"),
      db.raw("assignee.name as assigned_to_name"),
      db.raw("u.name as user_name"),
      db.raw("COUNT(DISTINCT r.id)::int as replies_count"),
    )
    .leftJoin("users as creator", "creator.id", "t.created_by")
    .leftJoin("users as assignee", "assignee.id", "t.assigned_to")
    .leftJoin("users as u", "u.id", "t.user_id")
    .leftJoin("ticket_replies as r", "r.ticket_id", "t.id")
    .where((qb) => {
      qb.where("t.user_id", uid)
        .orWhere("t.created_by", uid)
        .orWhere("t.assigned_to", uid)
        .orWhereExists(function () {
          this.select(1)
            .from("ticket_recipients as tr")
            .whereRaw("tr.ticket_id = t.id")
            .andWhere("tr.user_id", uid);
        })
        .orWhereExists(function () {
          this.select(1)
            .from("ticket_replies as rr")
            .whereRaw("rr.ticket_id = t.id")
            .andWhere((q2) => {
              q2.where("rr.author_id", uid).orWhere("rr.admin_id", uid);
            });
        });
    })
    .groupBy("t.id", "creator.name", "assignee.name", "u.name");

  if (st) ticketsQuery.andWhere("t.status", st);

  if (search) {
    ticketsQuery.andWhere((qb) => {
      qb.whereRaw("LOWER(COALESCE(t.subject,'')) LIKE ?", [`%${search}%`])
        .orWhereRaw("LOWER(COALESCE(t.message,'')) LIKE ?", [`%${search}%`])
        .orWhereRaw("CAST(t.id AS TEXT) LIKE ?", [`%${search}%`]);
    });
  }

  const items = await ticketsQuery
    .orderBy("t.last_message_at", "desc")
    .limit(ps)
    .offset(offset);

  // total
  const totalRow = await db("tickets as t")
    .countDistinct("t.id as c")
    .where((qb) => {
      qb.where("t.user_id", uid)
        .orWhere("t.created_by", uid)
        .orWhere("t.assigned_to", uid)
        .orWhereExists(function () {
          this.select(1)
            .from("ticket_recipients as tr")
            .whereRaw("tr.ticket_id = t.id")
            .andWhere("tr.user_id", uid);
        })
        .orWhereExists(function () {
          this.select(1)
            .from("ticket_replies as rr")
            .whereRaw("rr.ticket_id = t.id")
            .andWhere((q2) =>
              q2.where("rr.author_id", uid).orWhere("rr.admin_id", uid),
            );
        });
    })
    .modify((qb) => {
      if (st) qb.andWhere("t.status", st);
      if (search) {
        qb.andWhere((qbb) => {
          qbb
            .whereRaw("LOWER(COALESCE(t.subject,'')) LIKE ?", [`%${search}%`])
            .orWhereRaw("LOWER(COALESCE(t.message,'')) LIKE ?", [`%${search}%`])
            .orWhereRaw("CAST(t.id AS TEXT) LIKE ?", [`%${search}%`]);
        });
      }
    })
    .first();

  const total = Number(totalRow?.c || 0);

  return {
    items: items.map((t) => ({
      id: t.id,
      subject: t.subject,
      message: t.message,
      status: t.status,
      role: t.role,
      user_id: t.user_id,
      user_name: t.user_name,
      created_by: t.created_by,
      created_by_name: t.created_by_name,
      assigned_to: t.assigned_to,
      assigned_to_name: t.assigned_to_name,
      repliesCount: Number(t.replies_count || 0),
      last_message_at: t.last_message_at,
      created_at: t.created_at,
      updated_at: t.updated_at,
      attachment: t.attachment_path
        ? {
            path: t.attachment_path,
            name: t.attachment_name,
            mimetype: t.attachment_mimetype,
          }
        : null,
    })),
    page: p,
    pageSize: ps,
    total,
  };
}

/**
 * Full thread for a ticket: ticket + replies + recipients.
 */
export async function getTicketThread({ ticketId } = {}) {
  const tid = Number(ticketId);
  if (!Number.isFinite(tid)) throw new Error("Invalid ticketId");

  const ticket = await db("tickets as t")
    .select(
      "t.*",
      db.raw("creator.name as created_by_name"),
      db.raw("assignee.name as assigned_to_name"),
      db.raw("u.name as user_name"),
    )
    .leftJoin("users as creator", "creator.id", "t.created_by")
    .leftJoin("users as assignee", "assignee.id", "t.assigned_to")
    .leftJoin("users as u", "u.id", "t.user_id")
    .where("t.id", tid)
    .first();

  if (!ticket) throw new Error("Ticket not found");

  const replies = await db("ticket_replies as r")
    .select(
      "r.id",
      "r.ticket_id",
      "r.message",
      "r.attachment_path",
      "r.attachment_name",
      "r.attachment_mimetype",
      "r.created_at",
      "r.updated_at",
      "r.author_id",
      "r.admin_id",
      db.raw("author.name as author_name"),
      db.raw("admin.name as admin_name"),
    )
    .leftJoin("users as author", "author.id", "r.author_id")
    .leftJoin("users as admin", "admin.id", "r.admin_id")
    .where("r.ticket_id", tid)
    .orderBy("r.created_at", "asc");

  const recipients = await db("ticket_recipients as tr")
    .select("tr.user_id", "u.name", "u.mobile", "u.email", "tr.created_at")
    .join("users as u", "u.id", "tr.user_id")
    .where("tr.ticket_id", tid)
    .orderBy("tr.created_at", "asc");

  return {
    ticket: {
      ...ticket,
      attachment: ticket.attachment_path
        ? {
            path: ticket.attachment_path,
            name: ticket.attachment_name,
            mimetype: ticket.attachment_mimetype,
          }
        : null,
    },
    replies: replies.map((r) => ({
      ...r,
      attachment: r.attachment_path
        ? {
            path: r.attachment_path,
            name: r.attachment_name,
            mimetype: r.attachment_mimetype,
          }
        : null,
    })),
    recipients,
  };
}
