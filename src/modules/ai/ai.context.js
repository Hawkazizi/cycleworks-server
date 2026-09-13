import db from "../../common/db/knex.js";

/**
 * ✅ Role-aware live data for the AI assistant.
 *
 * Each panel only receives the data its role can actually access in the API
 * (mirrors the authorize() scopes in the route files):
 *
 *   customer    (buyer)       → /api/customers  (own requests, own containers via
 *                               their requests, own tickets/notifications)
 *   supplier    (user)        → /api/users + /api/containers (assigned containers,
 *                               own files/metadata/tracking, own application)
 *   admin       (admin)       → /api/admin (all requests, suppliers, containers,
 *                               QC data, reports, tickets)
 *   manager     (manager)     → same visibility as admin, fewer privileges
 *   qc_internal (qc_internal) → /api/qc (country-scoped containers, holds)
 *   qc_external (qc_external) → /api/external-qc (country-scoped containers,
 *                               external reports)
 *   super_admin (super_admin) → /api/superadmin (everything)
 *
 * Every helper is defensive: on any DB error it returns "" so the chat still
 * works with static knowledge only.
 */

const COUNTRY_MAP = { QA: "Qatar", OM: "Oman", BA: "Bahrain", KW: "Kuwait" };
const MAX_LEN = 3000;

const countBy = (rows, keyFn) => {
  const map = {};
  for (const r of rows) {
    const k = String(keyFn(r) ?? "unknown").toLowerCase();
    map[k] = (map[k] || 0) + 1;
  }
  return Object.entries(map)
    .map(([k, v]) => `${k}: ${v}`)
    .join(", ");
};

const fmtDate = (d) => {
  if (!d) return "—";
  try {
    return new Date(d).toISOString().split("T")[0];
  } catch {
    return "—";
  }
};

async function unreadCount(userId) {
  try {
    const [{ c }] = await db("notifications")
      .where({ user_id: userId, status: "unread" })
      .count("* as c");
    return Number(c || 0);
  } catch {
    return null;
  }
}

async function myTicketSummary(userId) {
  try {
    const rows = await db("tickets as t")
      .leftJoin("ticket_recipients as tr", "tr.ticket_id", "t.id")
      .where((qb) => {
        qb.where("t.created_by", userId)
          .orWhere("t.user_id", userId)
          .orWhere("tr.user_id", userId);
      })
      .orderBy("t.last_message_at", "desc")
      .limit(5)
      .select("t.id", "t.subject", "t.status");
    const open = rows.filter(
      (r) => String(r.status || "").toLowerCase() === "open",
    ).length;
    const recent = rows
      .map((r) => `#${r.id} [${r.status}] ${(r.subject || "").slice(0, 60)}`)
      .join(" | ");
    return { open, recent: recent || "none" };
  } catch {
    return { open: null, recent: "unavailable" };
  }
}

/* ------------------------------- CUSTOMER ------------------------------ */
async function customerContext(userId) {
  const lines = [];
  try {
    const reqs = await db("buyer_requests")
      .where({ buyer_id: userId })
      .orderBy("created_at", "desc")
      .limit(30)
      .select(
        "id",
        "status",
        "import_country",
        "container_amount",
        "deadline_start",
        "deadline_end",
        "created_at",
      );
    lines.push(`Total own requests: ${reqs.length}`);
    if (reqs.length) {
      lines.push(`By status → ${countBy(reqs, (r) => r.status)}`);
      for (const r of reqs.slice(0, 5)) {
        lines.push(
          `- req #${r.id}: status=${r.status}, country=${r.import_country || "—"}, containers=${r.container_amount ?? "—"}, deadline=${fmtDate(r.deadline_start)} → ${fmtDate(r.deadline_end)}`,
        );
      }
    }
  } catch {
    lines.push("Own requests: unavailable");
  }
  try {
    // Own containers = containers under own requests (via farmer_plans)
    const rows = await db("farmer_plan_containers as c")
      .join("farmer_plans as fp", "fp.id", "c.plan_id")
      .join("buyer_requests as br", "br.id", "fp.request_id")
      .where("br.buyer_id", userId)
      .select("c.id", "c.status", "c.is_completed", "c.tracking_code", "br.import_country");
    const done = rows.filter((r) => r.is_completed).length;
    lines.push(`Own containers: total=${rows.length}, completed=${done}, active=${rows.length - done}`);
    for (const r of rows.slice(0, 5)) {
      lines.push(
        `- container #${r.id}: status=${r.status || "—"}, tracking=${r.tracking_code || "—"}, country=${r.import_country || "—"}`,
      );
    }
  } catch {
    lines.push("Own containers: unavailable");
  }
  const t = await myTicketSummary(userId);
  lines.push(`Tickets: open≈${t.open ?? "?"}, recent: ${t.recent}`);
  const u = await unreadCount(userId);
  if (u !== null) lines.push(`Unread notifications: ${u}`);
  return lines.join("\n");
}

/* ------------------------------- SUPPLIER ------------------------------ */
async function supplierContext(userId) {
  const lines = [];
  try {
    const app = await db("user_applications")
      .where({ user_id: userId })
      .orderBy("created_at", "desc")
      .first();
    lines.push(
      app
        ? `Application: status=${app.status || "—"}, final_approved=${app.final_approved ? "yes" : "no"}`
        : "Application: none submitted",
    );
  } catch {
    lines.push("Application: unavailable");
  }
  try {
    const rows = await db("farmer_plan_containers as c")
      .leftJoin("farmer_plans as fp", "fp.id", "c.plan_id")
      .leftJoin("buyer_requests as br", "br.id", "fp.request_id")
      .where("c.supplier_id", userId)
      .orderBy("c.created_at", "desc")
      .limit(30)
      .select(
        "c.id",
        "c.status",
        "c.is_completed",
        "c.in_progress",
        "c.tracking_code",
        "c.metadata_status",
        "fp.plan_date",
        "br.import_country",
      );
    const done = rows.filter((r) => r.is_completed).length;
    lines.push(
      `Assigned containers: total=${rows.length}, completed=${done}, in_progress=${rows.filter((r) => r.in_progress && !r.is_completed).length}`,
    );
    if (rows.length) {
      lines.push(`By status → ${countBy(rows, (r) => r.status)}`);
      for (const r of rows.slice(0, 6)) {
        lines.push(
          `- container #${r.id}: status=${r.status || "—"}, tracking=${r.tracking_code || "—"}, metadata=${r.metadata_status || "—"}, plan=${fmtDate(r.plan_date)}, country=${r.import_country || "—"}`,
        );
      }
    }
  } catch {
    lines.push("Assigned containers: unavailable");
  }
  try {
    const files = await db("farmer_plan_files as f")
      .join("farmer_plan_containers as c", "c.id", "f.container_id")
      .where("c.supplier_id", userId)
      .select("f.status");
    lines.push(
      files.length
        ? `Own files: total=${files.length} (${countBy(files, (f) => f.status)})`
        : "Own files: none uploaded",
    );
  } catch {
    lines.push("Own files: unavailable");
  }
  const t = await myTicketSummary(userId);
  lines.push(`Tickets: open≈${t.open ?? "?"}, recent: ${t.recent}`);
  const u = await unreadCount(userId);
  if (u !== null) lines.push(`Unread notifications: ${u}`);
  return lines.join("\n");
}

/* ---------------------------- ADMIN / MANAGER --------------------------- */
async function adminContext(userId) {
  const lines = [];
  try {
    const rows = await db("buyer_requests").select("id", "status", "import_country", "created_at");
    lines.push(`Customer requests: total=${rows.length}`);
    if (rows.length) {
      lines.push(`By status → ${countBy(rows, (r) => r.status)}`);
      lines.push(`By country → ${countBy(rows, (r) => r.import_country)}`);
    }
    const recent = await db("buyer_requests as br")
      .leftJoin("users as b", "b.id", "br.buyer_id")
      .orderBy("br.created_at", "desc")
      .limit(5)
      .select("br.id", "br.status", "br.import_country", "b.name as buyer_name");
    for (const r of recent) {
      lines.push(`- req #${r.id}: ${r.status}, ${r.import_country || "—"}, buyer=${r.buyer_name || "—"}`);
    }
  } catch {
    lines.push("Customer requests: unavailable");
  }
  try {
    const [{ total }] = await db("farmer_plan_containers")
      .where({ is_rejected: false })
      .count("* as total");
    const [{ done }] = await db("farmer_plan_containers")
      .where({ is_rejected: false, is_completed: true })
      .count("* as done");
    const [{ prog }] = await db("farmer_plan_containers")
      .where({ is_rejected: false, in_progress: true, is_completed: false })
      .count("* as prog");
    const [{ rej }] = await db("farmer_plan_containers")
      .where({ is_rejected: true })
      .count("* as rej");
    lines.push(
      `Containers: active=${Number(total || 0)}, completed=${Number(done || 0)}, in_progress=${Number(prog || 0)}, rejected=${Number(rej || 0)}`,
    );
    const [{ pending }] = await db("farmer_plan_files")
      .where({ status: "submitted" })
      .count("* as pending");
    lines.push(`Supplier files awaiting review: ${Number(pending || 0)}`);
  } catch {
    lines.push("Containers: unavailable");
  }
  try {
    const [{ c }] = await db("user_applications")
      .where({ status: "pending" })
      .count("* as c");
    lines.push(`Pending applications: ${Number(c || 0)}`);
  } catch {
    lines.push("Pending applications: unavailable");
  }
  try {
    const [{ c }] = await db("tickets").where({ status: "open" }).count("* as c");
    lines.push(`Open tickets (all users): ${Number(c || 0)}`);
  } catch {
    lines.push("Open tickets: unavailable");
  }
  const u = await unreadCount(userId);
  if (u !== null) lines.push(`Your unread notifications: ${u}`);
  return lines.join("\n");
}

/* ------------------------------- QC PANELS ------------------------------ */
async function qcScopeCountry(userId) {
  const lic = await db("admin_license_keys")
    .where({ assigned_to: userId, is_active: true })
    .first();
  const code = lic?.country_code;
  return { code: code || null, country: COUNTRY_MAP[code] || null };
}

async function qcInternalContext(userId) {
  const lines = [];
  try {
    const { code, country } = await qcScopeCountry(userId);
    lines.push(`Your QC country: ${country || "unknown"} (${code || "?"})`);
    if (!country) return lines.join("\n");
    const rows = await db("farmer_plan_containers as c")
      .join("buyer_requests as br", "br.id", "c.buyer_request_id")
      .where("br.import_country", country)
      .where("br.status", "accepted")
      .select("c.id", "c.qc_status", "c.tracking_code", "c.qc_hold_reason");
    lines.push(`Containers in scope: ${rows.length}`);
    if (rows.length) {
      lines.push(`By QC status → ${countBy(rows, (r) => r.qc_status)}`);
      const holds = rows.filter((r) => String(r.qc_status || "").toLowerCase() === "hold").slice(0, 5);
      for (const h of holds) {
        lines.push(`- HOLD container #${h.id} (${h.tracking_code || "no TY"}): ${h.qc_hold_reason || "no reason recorded"}`);
      }
      for (const r of rows.filter((x) => String(x.qc_status || "").toLowerCase() === "pending").slice(0, 5)) {
        lines.push(`- pending QC: container #${r.id} (${r.tracking_code || "no TY"})`);
      }
    }
  } catch {
    lines.push("QC containers: unavailable");
  }
  const t = await myTicketSummary(userId);
  lines.push(`Tickets: open≈${t.open ?? "?"}, recent: ${t.recent}`);
  const u = await unreadCount(userId);
  if (u !== null) lines.push(`Unread notifications: ${u}`);
  return lines.join("\n");
}

async function qcExternalContext(userId) {
  const lines = [];
  try {
    const { code, country } = await qcScopeCountry(userId);
    lines.push(`Your QC country: ${country || "unknown"} (${code || "?"})`);
    if (!country) return lines.join("\n");
    const awaiting = await db("farmer_plan_containers as c")
      .join("buyer_requests as br", "br.id", "c.buyer_request_id")
      .leftJoin("external_qc_reports as r", "r.container_id", "c.id")
      .where("c.qc_status", "approved")
      .where("br.import_country", country)
      .where("br.status", "accepted")
      .whereNull("r.id")
      .select("c.id", "c.tracking_code");
    lines.push(`Approved containers awaiting your report: ${awaiting.length}`);
    for (const r of awaiting.slice(0, 6)) {
      lines.push(`- container #${r.id} (${r.tracking_code || "no TY"})`);
    }
    const reported = await db("external_qc_reports as r")
      .join("farmer_plan_containers as c", "c.id", "r.container_id")
      .join("buyer_requests as br", "br.id", "c.buyer_request_id")
      .where("br.import_country", country)
      .count("* as c");
    lines.push(`Reports already submitted (your country): ${Number(reported?.[0]?.c || 0)}`);
  } catch {
    lines.push("External QC data: unavailable");
  }
  const t = await myTicketSummary(userId);
  lines.push(`Tickets: open≈${t.open ?? "?"}, recent: ${t.recent}`);
  const u = await unreadCount(userId);
  if (u !== null) lines.push(`Unread notifications: ${u}`);
  return lines.join("\n");
}

/* ------------------------------ SUPER ADMIN ----------------------------- */
async function superAdminContext(userId) {
  const lines = [];
  try {
    const [{ c }] = await db("users").count("* as c");
    lines.push(`Users: total=${Number(c || 0)}`);
    const byRole = await db("users as u")
      .join("user_roles as ur", "ur.user_id", "u.id")
      .join("roles as r", "r.id", "ur.role_id")
      .select("r.name")
      .count("* as c")
      .groupBy("r.name");
    lines.push(`By role → ${byRole.map((r) => `${r.name}: ${r.c}`).join(", ")}`);
  } catch {
    lines.push("Users: unavailable");
  }
  try {
    const [{ total }] = await db("admin_license_keys").count("* as total");
    const [{ active }] = await db("admin_license_keys").where({ is_active: true }).count("* as active");
    lines.push(`License keys: active=${Number(active || 0)}/${Number(total || 0)}`);
  } catch {
    lines.push("License keys: unavailable");
  }
  try {
    const rows = await db("user_applications").select("status");
    lines.push(`Applications: total=${rows.length}${rows.length ? ` (${countBy(rows, (r) => r.status)})` : ""}`);
    const reqs = await db("buyer_requests").select("status");
    lines.push(`Customer requests: total=${reqs.length}${reqs.length ? ` (${countBy(reqs, (r) => r.status)})` : ""}`);
    const conts = await db("farmer_plan_containers").select("is_completed", "is_rejected");
    const active = conts.filter((c) => !c.is_rejected).length;
    lines.push(
      `Containers: total=${conts.length}, active=${active}, completed=${conts.filter((c) => c.is_completed).length}, rejected=${conts.filter((c) => c.is_rejected).length}`,
    );
    const [{ c }] = await db("tickets").where({ status: "open" }).count("* as c");
    lines.push(`Open tickets: ${Number(c || 0)}`);
  } catch {
    lines.push("Platform totals: unavailable");
  }
  const u = await unreadCount(userId);
  if (u !== null) lines.push(`Your unread notifications: ${u}`);
  return lines.join("\n");
}

/* --------------------------------- ENTRY -------------------------------- */
export async function buildRoleContext(panel, user) {
  try {
    const userId = user?.id;
    if (!userId) return "";
    let ctx = "";
    switch (panel) {
      case "customer":
        ctx = await customerContext(userId);
        break;
      case "supplier":
        ctx = await supplierContext(userId);
        break;
      case "admin":
      case "manager":
        ctx = await adminContext(userId);
        break;
      case "qc_internal":
        ctx = await qcInternalContext(userId);
        break;
      case "qc_external":
        ctx = await qcExternalContext(userId);
        break;
      case "super_admin":
        ctx = await superAdminContext(userId);
        break;
      default:
        ctx = "";
    }
    return String(ctx || "").slice(0, MAX_LEN);
  } catch (err) {
    console.error("buildRoleContext error:", err?.message || err);
    return "";
  }
}
