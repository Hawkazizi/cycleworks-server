import db from "../../common/db/knex.js";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import os from "os";
import v8 from "v8";
import { execSync } from "child_process";

// If your notification service export differs, adjust this import.
// Common patterns are:
//   import * as NotificationService from "../notification/notification.service.js";
//   import NotificationService from "../notification/notification.service.js";
//   import { create as notifyCreate } from "../notification/notification.service.js";

/* =======================================================================
   SUPER ADMIN SERVICE
   - Contains: License Keys + Applications logic
   - Does NOT change your existing admin.service
======================================================================= */

const BASE_URL = process.env.BASE_URL || "";

/* =======================================================================
   🧩 DASHBOARD (Super Admin) - DETAILED + SEPARATED
======================================================================= */

function normalizeCountryKey(country) {
  const raw = String(country || "").trim();
  if (!raw) return "Unknown";
  return raw;
}

function mapCountRows(rows, keyField, countField = "c", normalizeFn) {
  const out = {};
  for (const r of rows || []) {
    const kRaw = r?.[keyField];
    const k = normalizeFn ? normalizeFn(kRaw) : String(kRaw ?? "Unknown");
    out[k] = Number(r?.[countField] || 0);
  }
  return out;
}

function pickCountryCount(map, countryName) {
  // match exact or case-insensitive
  const direct = map[countryName];
  if (direct != null) return Number(direct || 0);

  const lower = countryName.toLowerCase();
  for (const [k, v] of Object.entries(map)) {
    if (String(k || "").toLowerCase() === lower) return Number(v || 0);
  }
  return 0;
}

export async function getAdminDashboard() {
  /* =========================================================
     1) USERS (total + by role + by status)
  ========================================================= */
  const usersCountRow = await db("users").count("* as c").first();
  const usersTotal = Number(usersCountRow?.c || 0);

  // By role (uses roles + user_roles)
  const usersByRoleRows = await db("users as u")
    .leftJoin("user_roles as ur", "ur.user_id", "u.id")
    .leftJoin("roles as r", "r.id", "ur.role_id")
    .select(db.raw("COALESCE(r.name, 'no_role') as role"))
    .countDistinct("u.id as c")
    .groupBy("role");

  const usersByRole = mapCountRows(usersByRoleRows, "role", "c", (x) =>
    String(x || "no_role").toLowerCase(),
  );

  // By user.status (pending/active/blocked/etc)
  const usersByStatusRows = await db("users")
    .select(db.raw("COALESCE(status, 'unknown') as status"))
    .count("* as c")
    .groupBy("status");

  const usersByStatus = mapCountRows(usersByStatusRows, "status", "c", (x) =>
    String(x || "unknown").toLowerCase(),
  );

  // Convenience role numbers (your naming)
  const rolesBreakdown = {
    admin: usersByRole["admin"] || 0,
    manager: usersByRole["manager"] || 0,
    supplier: usersByRole["user"] || 0, // supplier = "user"
    qc_internal: usersByRole["qc_internal"] || 0,
    qc_external: usersByRole["qc_external"] || 0,
    buyer: usersByRole["buyer"] || 0,
    no_role: usersByRole["no_role"] || 0,
  };

  /* =========================================================
     2) APPLICATIONS (pending + by status + final approved)
  ========================================================= */
  const appsByStatusRows = await db("user_applications")
    .select(db.raw("COALESCE(status,'unknown') as status"))
    .count("* as c")
    .groupBy("status");

  const applicationsByStatus = mapCountRows(
    appsByStatusRows,
    "status",
    "c",
    (x) => String(x || "unknown").toLowerCase(),
  );

  const appsPending = applicationsByStatus["pending"] || 0;

  const appsFinalApprovedRow = await db("user_applications")
    .where({ final_approved: true })
    .count("* as c")
    .first();
  const appsFinalApproved = Number(appsFinalApprovedRow?.c || 0);

  const appsTotalRow = await db("user_applications").count("* as c").first();
  const appsTotal = Number(appsTotalRow?.c || 0);

  /* =========================================================
     3) BUYER REQUESTS (status + allocation + country + types + deadlines)
  ========================================================= */
  const buyerTotalRow = await db("buyer_requests").count("* as c").first();
  const buyerTotal = Number(buyerTotalRow?.c || 0);

  const buyerByStatusRows = await db("buyer_requests as br")
    .select(db.raw("COALESCE(br.status,'unknown') as status"))
    .count("* as c")
    .groupBy("status");

  const buyerByStatus = mapCountRows(buyerByStatusRows, "status", "c", (x) =>
    String(x || "unknown").toLowerCase(),
  );

  const buyerByAllocationRows = await db("buyer_requests as br")
    .select(
      db.raw("COALESCE(br.allocation_status,'unknown') as allocation_status"),
    )
    .count("* as c")
    .groupBy("allocation_status");

  const buyerByAllocationStatus = mapCountRows(
    buyerByAllocationRows,
    "allocation_status",
    "c",
    (x) => String(x || "unknown").toLowerCase(),
  );

  const buyerByCountryRows = await db("buyer_requests as br")
    .select(db.raw("COALESCE(br.import_country,'Unknown') as country"))
    .count("* as c")
    .groupBy("country")
    .orderBy("c", "desc");

  const buyerByCountryMap = mapCountRows(
    buyerByCountryRows,
    "country",
    "c",
    normalizeCountryKey,
  );

  const buyerByCountry = Object.entries(buyerByCountryMap).map(([name, v]) => ({
    name,
    v,
  }));

  const buyerByProductTypeRows = await db("buyer_requests as br")
    .select(db.raw("COALESCE(br.product_type,'Unknown') as product_type"))
    .count("* as c")
    .groupBy("product_type")
    .orderBy("c", "desc");

  const buyerByProductType = Object.entries(
    mapCountRows(
      buyerByProductTypeRows,
      "product_type",
      "c",
      (x) => String(x || "Unknown").trim() || "Unknown",
    ),
  ).map(([name, v]) => ({ name, v }));

  const buyerByEggTypeRows = await db("buyer_requests as br")
    .select(db.raw("COALESCE(br.egg_type,'Unknown') as egg_type"))
    .count("* as c")
    .groupBy("egg_type")
    .orderBy("c", "desc");

  const buyerByEggType = Object.entries(
    mapCountRows(
      buyerByEggTypeRows,
      "egg_type",
      "c",
      (x) => String(x || "Unknown").trim() || "Unknown",
    ),
  ).map(([name, v]) => ({ name, v }));

  // Upcoming deadlines in next 30 days (by deadline_start)
  const upcomingDeadlinesRow = await db("buyer_requests as br")
    .whereNotNull("br.deadline_start")
    .andWhereRaw("br.deadline_start >= CURRENT_DATE")
    .andWhereRaw("br.deadline_start < CURRENT_DATE + INTERVAL '30 days'")
    .count("* as c")
    .first();

  const upcomingDeadlines30d = Number(upcomingDeadlinesRow?.c || 0);

  // Recent buyer requests (with buyer + preferred supplier details)
  const recentRequests = await db("buyer_requests as br")
    .leftJoin("users as buyer", "buyer.id", "br.buyer_id")
    .leftJoin("users as pref", "pref.id", "br.preferred_supplier_id")
    .select(
      "br.id",
      "br.order_number",
      "br.import_country",
      "br.status",
      "br.allocation_status",
      "br.allocated_containers",
      "br.container_amount",
      "br.cartons",
      "br.product_type",
      "br.egg_type",
      "br.transport_type",
      "br.deadline_start",
      "br.deadline_end",
      "br.created_at",
      "buyer.id as buyer_id",
      "buyer.name as buyer_name",
      "buyer.mobile as buyer_mobile",
      "pref.id as preferred_supplier_id",
      "pref.name as preferred_supplier_name",
      "pref.mobile as preferred_supplier_mobile",
    )
    .orderBy("br.created_at", "desc")
    .limit(8);

  /* =========================================================
     4) CONTAINERS (overall + by country + by qc_status + top suppliers + recent)
     NOTE: we attach country via:
     - direct c.buyer_request_id -> br
     - OR via fp.request_id -> br
     This prevents missing/incorrect country.
  ========================================================= */

  // Overall totals (single scan)
  const containersTotals = await db("farmer_plan_containers as c")
    .select(
      db.raw("COUNT(*) as total_all"),
      db.raw("COUNT(*) FILTER (WHERE c.is_rejected = true) as total_rejected"),
      db.raw(
        "COUNT(*) FILTER (WHERE c.is_rejected = false) as total_non_rejected",
      ),
      db.raw(
        `COUNT(*) FILTER (
          WHERE c.is_rejected = false
            AND c.in_progress = true
            AND c.is_completed = false
        ) as total_in_progress`,
      ),
      db.raw(
        `COUNT(*) FILTER (
          WHERE c.is_rejected = false
          AND c.is_completed = true
          ) as total_completed`,
      ),
      db.raw(
        `COUNT(*) FILTER (
          WHERE LOWER(COALESCE(c.farmer_status,'')) = 'pending'
        ) as total_pending_farmer`,
      ),
    )
    .first();

  const totalContainersAll = Number(containersTotals?.total_all || 0);
  const rejectedContainers = Number(containersTotals?.total_rejected || 0);
  const totalContainers = Number(containersTotals?.total_non_rejected || 0);
  const containersInProgress = Number(containersTotals?.total_in_progress || 0);
  const containersCompleted = Number(containersTotals?.total_completed || 0);
  const pendingFarmer = Number(containersTotals?.total_pending_farmer || 0);

  // By country (completed + in_progress + rejected + total)
  const containersByCountryRows = await db("farmer_plan_containers as c")
    .leftJoin("farmer_plans as fp", "fp.id", "c.plan_id")
    .leftJoin("buyer_requests as br_fp", "br_fp.id", "fp.request_id")
    .leftJoin("buyer_requests as br_c", "br_c.id", "c.buyer_request_id")
    .select(
      db.raw(
        "COALESCE(br_c.import_country, br_fp.import_country, 'Unknown') as country",
      ),
    )
    .select(
      db.raw("COUNT(*) as total"),
      db.raw("COUNT(*) FILTER (WHERE c.is_rejected = true) as rejected"),
      db.raw("COUNT(*) FILTER (WHERE c.is_rejected = false) as non_rejected"),
      db.raw(
        `COUNT(*) FILTER (
          WHERE c.is_rejected = false
            AND c.in_progress = true
            AND c.is_completed = false
        ) as in_progress`,
      ),
      db.raw(
        `COUNT(*) FILTER (
          WHERE c.is_rejected = false
          AND c.is_completed = true
          ) as completed`,
      ),
    )
    .groupBy("country")
    .orderBy("total", "desc");

  const containersByCountryDetailed = containersByCountryRows.map((r) => ({
    country: normalizeCountryKey(r.country),
    total: Number(r.total || 0),
    nonRejected: Number(r.non_rejected || 0),
    rejected: Number(r.rejected || 0),
    inProgress: Number(r.in_progress || 0),
    completed: Number(r.completed || 0),
  }));

  // For charts you had: containersByCountry as array {name,count}
  // Your old code mistakenly used "completed" for count; keep that behavior for UI compatibility.
  const containersByCountry = containersByCountryDetailed.map((x) => ({
    name: x.country,
    count: x.completed,
  }));

  // By qc_status (pending/approved/rejected/hold/etc)
  const containersByQcStatusRows = await db("farmer_plan_containers as c")
    .select(db.raw("COALESCE(c.qc_status,'unknown') as qc_status"))
    .count("* as c")
    .groupBy("qc_status")
    .orderBy("c", "desc");

  const containersByQcStatus = Object.entries(
    mapCountRows(containersByQcStatusRows, "qc_status", "c", (x) =>
      String(x || "unknown").toLowerCase(),
    ),
  ).map(([name, v]) => ({ name, v }));

  // Top suppliers by container count
  const topSuppliersRows = await db("farmer_plan_containers as c")
    .leftJoin("users as s", "s.id", "c.supplier_id")
    .select(
      "c.supplier_id",
      "s.name as supplier_name",
      "s.mobile as supplier_mobile",
    )
    .count("* as c")
    .groupBy("c.supplier_id", "s.name", "s.mobile")
    .orderBy("c", "desc")
    .limit(8);

  const topSuppliers = topSuppliersRows.map((r) => ({
    supplier_id: r.supplier_id,
    supplier_name: r.supplier_name,
    supplier_mobile: r.supplier_mobile,
    containers: Number(r.c || 0),
  }));

  // Recent containers (with request + country + buyer + supplier)
  const recentContainers = await db("farmer_plan_containers as c")
    .leftJoin("farmer_plans as fp", "fp.id", "c.plan_id")
    .leftJoin("buyer_requests as br_fp", "br_fp.id", "fp.request_id")
    .leftJoin("buyer_requests as br_c", "br_c.id", "c.buyer_request_id")
    .leftJoin(
      "users as buyer",
      "buyer.id",
      db.raw("COALESCE(br_c.buyer_id, br_fp.buyer_id)"),
    )
    .leftJoin("users as sup", "sup.id", "c.supplier_id")
    .select(
      "c.id",
      "c.container_no",
      "c.status",
      "c.in_progress",
      "c.is_completed",
      "c.is_rejected",
      "c.farmer_status",
      "c.qc_status",
      "c.tracking_code",
      "c.plan_date",
      "c.completed_at",
      "c.created_at",
      "c.updated_at",
      db.raw("COALESCE(br_c.id, br_fp.id) as buyer_request_id"),
      db.raw("COALESCE(br_c.order_number, br_fp.order_number) as order_number"),
      db.raw(
        "COALESCE(br_c.import_country, br_fp.import_country, 'Unknown') as import_country",
      ),
      "buyer.id as buyer_id",
      "buyer.name as buyer_name",
      "buyer.mobile as buyer_mobile",
      "sup.id as supplier_id",
      "sup.name as supplier_name",
      "sup.mobile as supplier_mobile",
    )
    .orderBy("c.created_at", "desc")
    .limit(10);

  /* =========================================================
     5) Legacy stats (keep keys your current UI expects)
     - but now they are derived from correct breakdowns
  ========================================================= */

  // buyer country convenience
  const buyerQatar = pickCountryCount(buyerByCountryMap, "Qatar");
  const buyerOman = pickCountryCount(buyerByCountryMap, "Oman");
  const buyerBahrain = pickCountryCount(buyerByCountryMap, "Bahrain");
  const buyerKuwait = pickCountryCount(buyerByCountryMap, "Kuwait");

  // containers convenience per country
  const countryToCompleted = {};
  const countryToInProgress = {};
  for (const row of containersByCountryDetailed) {
    countryToCompleted[row.country] = row.completed;
    countryToInProgress[row.country] = row.inProgress;
  }

  const stats = {
    // users/apps
    users: usersTotal,
    applications: appsPending,

    // buyer requests (legacy)
    buyerTotal,
    buyerPending: buyerByStatus["pending"] || 0,
    buyerAccepted: buyerByStatus["accepted"] || 0,
    buyerRejected: buyerByStatus["rejected"] || 0,
    buyerCancelled: buyerByStatus["cancelled"] || 0,
    buyerCompletedRequests: buyerByStatus["completed"] || 0,

    buyerOman,
    buyerQatar,
    buyerBahrain,
    buyerKuwait,

    // containers (legacy)
    totalContainers, // non-rejected
    containersInProgress,
    rejectedContainers,
    pendingFarmer,

    inProgressQatar: pickCountryCount(countryToInProgress, "Qatar"),
    inProgressOman: pickCountryCount(countryToInProgress, "Oman"),
    inProgressBahrain: pickCountryCount(countryToInProgress, "Bahrain"),
    inProgressKuwait: pickCountryCount(countryToInProgress, "Kuwait"),

    completedQatar: pickCountryCount(countryToCompleted, "Qatar"),
    completedOman: pickCountryCount(countryToCompleted, "Oman"),
    completedBahrain: pickCountryCount(countryToCompleted, "Bahrain"),
    completedKuwait: pickCountryCount(countryToCompleted, "Kuwait"),

    // old UI used these too (completed values)
    qatarContainers: pickCountryCount(countryToCompleted, "Qatar"),
    omanContainers: pickCountryCount(countryToCompleted, "Oman"),
    bahrainContainers: pickCountryCount(countryToCompleted, "Bahrain"),
    kuwaitContainers: pickCountryCount(countryToCompleted, "Kuwait"),
  };

  /* =========================================================
     6) Final response (legacy + detailed sections)
  ========================================================= */
  return {
    stats,

    // NEW: clear separation sections
    users: {
      total: usersTotal,
      byRole: rolesBreakdown,
      byStatus: usersByStatus,
      rawByRole: usersByRole, // full map (lowercased role keys)
    },

    applications: {
      total: appsTotal,
      pending: appsPending,
      finalApproved: appsFinalApproved,
      byStatus: applicationsByStatus,
    },

    buyerRequests: {
      total: buyerTotal,
      byStatus: buyerByStatus,
      byAllocationStatus: buyerByAllocationStatus,
      byCountry: buyerByCountryMap,
      byProductType: buyerByProductType,
      byEggType: buyerByEggType,
      upcomingDeadlines30d,
    },

    containers: {
      totalAll: totalContainersAll,
      totalNonRejected: totalContainers,
      totalRejected: rejectedContainers,
      totalInProgress: containersInProgress,
      totalCompleted: containersCompleted,
      pendingFarmer,
      byCountryDetailed: containersByCountryDetailed,
      byQcStatus: containersByQcStatus,
      topSuppliers,
    },

    // Keep these for your existing UI charts
    buyerByCountry,
    containersByCountry,

    // Lists
    recentRequests,
    recentContainers,
  };
}

/* =======================================================================
   🧩 server specs (Super Admin)
======================================================================= */
function bytesToHuman(bytes) {
  if (bytes == null || Number.isNaN(Number(bytes))) return null;
  const b = Number(bytes);
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = b;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
}

/**
 * Best-effort disk usage (Linux/macOS with `df`).
 * If it fails (Windows or restricted env), returns null.
 */
function getDiskUsage() {
  try {
    // df -kP -> parseable POSIX output, block size KB
    const out = execSync("df -kP /", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim()
      .split("\n");

    // header: Filesystem 1024-blocks Used Available Capacity Mounted on
    const line = out[1]; // root line
    if (!line) return null;

    const parts = line.replace(/\s+/g, " ").split(" ");
    // indexes can vary by FS name, but for df -P it should be stable:
    // [filesystem, blocks, used, available, capacity, mount]
    const blocksKb = Number(parts[1]) * 1024;
    const usedKb = Number(parts[2]) * 1024;
    const availKb = Number(parts[3]) * 1024;
    const capacity = parts[4]; // like "42%"

    return {
      mount: parts[5] || "/",
      total_bytes: blocksKb,
      used_bytes: usedKb,
      free_bytes: availKb,
      usage_percent: capacity,
      total_human: bytesToHuman(blocksKb),
      used_human: bytesToHuman(usedKb),
      free_human: bytesToHuman(availKb),
    };
  } catch {
    return null;
  }
}

export async function getServerSpecs() {
  const cpus = os.cpus() || [];
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;

  const processMem = process.memoryUsage(); // rss, heapTotal, heapUsed, external, arrayBuffers

  return {
    server_time: new Date().toISOString(),

    system: {
      platform: os.platform(),
      arch: os.arch(),
      hostname: os.hostname(),
      uptime_seconds: os.uptime(),
      uptime_human: `${Math.floor(os.uptime() / 60)} min`,
      loadavg: os.loadavg ? os.loadavg() : null, // linux/mac only; on windows returns [0,0,0]
    },

    cpu: {
      model: cpus[0]?.model || null,
      cores: cpus.length || null,
      speed_mhz: cpus[0]?.speed || null,
    },

    memory: {
      total_bytes: totalMem,
      free_bytes: freeMem,
      used_bytes: usedMem,
      total_human: bytesToHuman(totalMem),
      free_human: bytesToHuman(freeMem),
      used_human: bytesToHuman(usedMem),
      used_percent: totalMem ? Math.round((usedMem / totalMem) * 100) : null,
    },

    disk: getDiskUsage(), // may be null if unsupported

    runtime: {
      node: process.version,
      pid: process.pid,
      env: process.env.NODE_ENV || "development",
      app_uptime_seconds: Math.floor(process.uptime()),
    },

    process_memory: {
      rss_bytes: processMem.rss,
      heap_total_bytes: processMem.heapTotal,
      heap_used_bytes: processMem.heapUsed,
      external_bytes: processMem.external,
      array_buffers_bytes: processMem.arrayBuffers,

      rss_human: bytesToHuman(processMem.rss),
      heap_total_human: bytesToHuman(processMem.heapTotal),
      heap_used_human: bytesToHuman(processMem.heapUsed),
    },

    v8: {
      heap_statistics: v8.getHeapStatistics(),
      heap_space_statistics: v8.getHeapSpaceStatistics(),
    },
  };
}

/* =======================================================================
   🧩 ROLES & SETTINGS (Super Admin)
======================================================================= */
export const getAllSettings = async () => db("settings").select("*");

export const updateSetting = async (key, value) => {
  const existing = await db("settings").where({ key }).first();
  if (!existing) throw new Error("Setting not found");

  const updatedRows = await db("settings")
    .where({ key })
    .update({ value, updated_at: db.fn.now() })
    .returning("*");

  return Array.isArray(updatedRows) ? updatedRows[0] : updatedRows;
};
export const getRoles = async () => {
  return db("roles").select("id", "name").orderBy("name", "asc");
};
/* =======================================================================
   👥 USER MANAGEMENT (Super Admin)
======================================================================= */

export const createUserWithRole = async ({
  name,
  email,
  password,
  role_id,
  mobile,
}) => {
  return db.transaction(async (trx) => {
    const exists = await trx("users").where({ email }).first();
    if (exists) throw new Error("ایمیل قبلاً استفاده شده است.");

    const password_hash = await bcrypt.hash(password, 10);

    const inserted = await trx("users")
      .insert({
        name,
        email,
        mobile,
        password_hash,
        status: "active",
      })
      .returning(["id", "name", "email", "mobile", "status", "created_at"]);

    const user = Array.isArray(inserted) ? inserted[0] : inserted;

    if (role_id) {
      await trx("user_roles").insert({ user_id: user.id, role_id });
    }

    return user;
  });
};

export const getAllUsers = async () => {
  return (
    db("users as u")
      // ✅ FIX 1: Changed .join to .leftJoin so users without a role mapping still show up
      .leftJoin("user_roles as ur", "u.id", "ur.user_id")
      .leftJoin("roles as r", "ur.role_id", "r.id")
      .leftJoin("farmer_plan_containers as c", "c.supplier_id", "u.id")

      // ✅ FIX 2: Removed .where("r.name", "user")
      // Previously, if the role name wasn't exactly "user", the user was hidden!

      .groupBy(
        "u.id",
        "u.name",
        "u.email",
        "u.mobile",
        "u.status",
        "u.created_at",
        "r.name",
      )
      .select(
        "u.id",
        "u.name",
        db.raw("COALESCE(u.email, '') as email"),
        "u.mobile",
        "u.status",
        "u.created_at",
        // ✅ FIX 3: Default to 'user' (supplier) if no role is assigned in the DB
        db.raw("COALESCE(r.name, 'user') as role_name"),
        db.raw("COUNT(DISTINCT c.id) AS containers_count"),
      )
      .orderBy("u.id", "asc")
  );
};

export const toggleUserStatus = async (targetUserId, action, superAdminId) => {
  if (targetUserId === superAdminId) {
    throw new Error("Admins cannot ban themselves");
  }

  const user = await db("users")
    .select("id", "status", "name", "email", "created_at")
    .where({ id: targetUserId })
    .first();

  if (!user) throw new Error("User not found");

  if (action === "ban" && user.status === "inactive") {
    throw new Error("User is already inactive");
  }
  if (action === "unban" && user.status === "active") {
    throw new Error("User is already active");
  }

  const newStatus = action === "ban" ? "inactive" : "active";

  const updatedRows = await db("users")
    .where({ id: targetUserId })
    .update({ status: newStatus })
    .returning(["id", "name", "email", "status", "created_at"]);

  return Array.isArray(updatedRows) ? updatedRows[0] : updatedRows;
};

export const deleteUser = async (userId) => {
  return db.transaction(async (trx) => {
    await trx("user_roles").where({ user_id: userId }).del();
    await trx("user_applications").where({ user_id: userId }).del();
    await trx("admin_license_keys")
      .where({ assigned_to: userId })
      .update({ assigned_to: null });

    const deleted = await trx("users").where({ id: userId }).del();
    if (!deleted) throw new Error("User not found");

    return true;
  });
};

/* =======================================================================
   🔑 LICENSE KEYS
======================================================================= */

const QC_ROLES = ["qc_internal", "qc_external"];
const QC_COUNTRIES = ["OM", "QA", "BA", "KW"];
export async function getAllLicenseKeys() {
  return db("admin_license_keys as alk")
    .leftJoin("roles as r", "alk.role_id", "r.id")
    .leftJoin("users as u", "alk.assigned_to", "u.id")
    .select(
      "alk.*",
      "r.name as role_name",
      "u.name as assigned_user_name",
      "u.email as assigned_user_email",
    )
    .orderBy("alk.created_at", "desc");
}

export async function createLicenseKey({
  key,
  role_id,
  country_code,
  assigned_to,
  user,
  currentCountry = "IR", // ✅ Add this parameter
}) {
  let userId = assigned_to || null;

  const role = await db("roles").where({ id: role_id }).first();
  if (!role) throw new Error("Invalid role");

  let finalCountry = country_code;
  if (QC_ROLES.includes(role.name)) {
    if (!QC_COUNTRIES.includes(finalCountry)) {
      throw new Error("QC licenses must have country_code: OM, QA, BA, or KW");
    }
  } else {
    finalCountry = currentCountry; // ✅ Use currentCountry instead of "IR"
  }

  // Auto-create user if provided
  if (user?.name) {
    const random = Math.floor(Math.random() * 1000000);
    const fakeEmail = `admin_${random}@system.local`;
    const fakeMobile = `09${random}`.padEnd(11, "0");
    const fakePassword = crypto.randomBytes(8).toString("hex");
    const passwordHash = await bcrypt.hash(fakePassword, 10);

    const inserted = await db("users")
      .insert({
        name: user.name,
        email: fakeEmail,
        mobile: fakeMobile,
        password_hash: passwordHash,
        status: "active",
      })
      .returning("*");

    const newUser = Array.isArray(inserted) ? inserted[0] : inserted;
    userId = newUser.id;

    await db("user_roles").where({ user_id: userId }).del();
    await db("user_roles").insert({ user_id: userId, role_id });
  }

  const inserted = await db("admin_license_keys")
    .insert({
      key,
      role_id,
      country_code: finalCountry,
      assigned_to: userId,
    })
    .returning("*");

  return Array.isArray(inserted) ? inserted[0] : inserted;
}

export async function updateLicenseKey({
  id,
  key,
  role_id,
  country_code,
  assigned_to,
  currentCountry = "IR", // ✅ Add this parameter
}) {
  const existing = await db("admin_license_keys").where({ id }).first();
  if (!existing) throw new Error("License key not found");

  const role = await db("roles").where({ id: role_id }).first();
  if (!role) throw new Error("Invalid role");

  let finalCountry = country_code;
  if (QC_ROLES.includes(role.name)) {
    if (!QC_COUNTRIES.includes(finalCountry)) {
      throw new Error("QC licenses must have country_code: OM, QA, BA, or KW");
    }
  } else {
    finalCountry = currentCountry; // ✅ Use the current country context
  }

  const updatedRows = await db("admin_license_keys").where({ id }).update(
    {
      key,
      role_id,
      country_code: finalCountry,
      assigned_to,
    },
    "*",
  );

  const updated = Array.isArray(updatedRows) ? updatedRows[0] : updatedRows;

  if (assigned_to && role_id) {
    await db("user_roles").where({ user_id: assigned_to }).del();
    await db("user_roles").insert({ user_id: assigned_to, role_id });
  }

  return updated;
}

export async function toggleLicenseKey(id) {
  const existing = await db("admin_license_keys").where({ id }).first();
  if (!existing) throw new Error("License key not found");

  const updatedRows = await db("admin_license_keys")
    .where({ id })
    .update({ is_active: !existing.is_active }, "*");

  return Array.isArray(updatedRows) ? updatedRows[0] : updatedRows;
}

export async function deleteLicenseKey(id) {
  const deleted = await db("admin_license_keys").where({ id }).del();
  if (!deleted) throw new Error("License key not found");
  return true;
}

/* =======================================================================
   📋 APPLICATIONS
======================================================================= */

export async function getApplications({
  page = 1,
  pageSize = 10,
  search = "",
  status = null,
  final_approved = null,
  user_status = null,
}) {
  const offset = (page - 1) * pageSize;

  const query = baseApplicationQuery();

  /* -------------------- SEARCH -------------------- */
  if (search) {
    query.where((qb) => {
      qb.whereILike("users.name", `%${search}%`)
        .orWhereILike("users.email", `%${search}%`)
        .orWhereILike("users.mobile", `%${search}%`)
        .orWhereILike("user_applications.supplier_name", `%${search}%`);
    });
  }

  /* -------------------- FILTERS -------------------- */
  if (status) {
    query.andWhere("user_applications.status", status);
  }

  if (final_approved !== null) {
    query.andWhere("user_applications.final_approved", final_approved);
  }

  if (user_status) {
    query.andWhere("users.status", user_status);
  }

  /* -------------------- TOTAL COUNT -------------------- */
  const countResult = await query
    .clone()
    .clear("select")
    .clear("order")
    .clear("limit")
    .clear("offset")
    .countDistinct("user_applications.id as total")
    .first();

  const total = Number(countResult?.total || 0);

  /* -------------------- DATA -------------------- */
  const rows = await query.clone().limit(pageSize).offset(offset);

  return {
    data: rows.map(enrichApplicationFiles),
    meta: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}
export async function getApplicationsByUser(userId) {
  const rows = await baseApplicationQuery().where(
    "user_applications.user_id",
    userId,
  );
  return rows.map(enrichApplicationFiles);
}
// Helper: convert JWT user id to DB integer (or null)
function toDbUserId(id) {
  const n = Number(id);
  return Number.isInteger(n) ? n : null; // "superadmin" => null
}

export async function updateApplication(id, updates, userId, role) {
  const existing = await db("user_applications").where({ id }).first();
  if (!existing) throw new Error("Application not found");

  const dbUserId = toDbUserId(userId);

  const userEditable = [
    "reason",
    "supplier_name",
    "biosecurity",
    "vaccination",
    "emergency",
    "food_safety",
    "description",
    "farm_biosecurity",
  ];

  // ✅ IMPORTANT: do NOT allow reviewed_by / reviewed_at from client body
  const adminEditable = [
    "status",
    "admin_comment",
    "final_approved",
    "final_admin_comment",
  ];

  // Super Admin should have full admin/manager power here
  let allowed = [];
  if (["admin", "manager", "super_admin"].includes(role)) {
    allowed = [...userEditable, ...adminEditable];
  } else if (["user", "farmer"].includes(role)) {
    allowed = [...userEditable];
  }

  const updateData = Object.fromEntries(
    Object.entries(updates).filter(([key]) => allowed.includes(key)),
  );

  if (!Object.keys(updateData).length) {
    throw new Error("No valid fields to update");
  }

  // Phase 1: approval changes user's status
  if (updateData.status && ["admin", "manager", "super_admin"].includes(role)) {
    const userStatus = updateData.status === "approved" ? "active" : "pending";
    await db("users")
      .where({ id: existing.user_id })
      .update({ status: userStatus });
  }

  // Phase 2: final review
  if (
    "final_approved" in updates &&
    ["admin", "manager", "super_admin"].includes(role)
  ) {
    updateData.final_reviewed_by = dbUserId; // ✅ int or null
    updateData.final_reviewed_at = db.fn.now();
  }

  const updatedRows = await db("user_applications")
    .where({ id })
    .update(
      {
        ...updateData,

        // ✅ Always set reviewed_by/reviewed_at from server identity (not client)
        ...(role !== "user"
          ? { reviewed_by: dbUserId, reviewed_at: db.fn.now() }
          : {}),
      },
      "*",
    );

  const updated = Array.isArray(updatedRows) ? updatedRows[0] : updatedRows;

  return { message: "Application updated", application: updated };
}

export async function reviewApplication(
  id,
  status,
  reviewerId,
  role = "super_admin",
) {
  if (!["admin", "manager", "super_admin"].includes(role)) {
    throw new Error("Unauthorized");
  }

  const existing = await db("user_applications").where({ id }).first();
  if (!existing) throw new Error("Application not found");

  const dbReviewerId = toDbUserId(reviewerId);

  const updatedRows = await db("user_applications").where({ id }).update(
    {
      status,
      reviewed_by: dbReviewerId, // ✅ int or null
      reviewed_at: db.fn.now(),
    },
    "*",
  );

  const updated = Array.isArray(updatedRows) ? updatedRows[0] : updatedRows;

  // mirror your “Phase 1” logic: approved => active, else pending
  if (status) {
    const userStatus = status === "approved" ? "active" : "pending";
    await db("users")
      .where({ id: existing.user_id })
      .update({ status: userStatus });
  }

  return { message: "Application reviewed", application: updated };
}
/* -------------------- Internal: Base Application Query -------------------- */
function baseApplicationQuery() {
  return db("user_applications")
    .join("users", "user_applications.user_id", "users.id")
    .leftJoin(
      "users as reviewer",
      "user_applications.reviewed_by",
      "reviewer.id",
    )
    .leftJoin(
      "users as final_reviewer",
      "user_applications.final_reviewed_by",
      "final_reviewer.id",
    )
    .select(
      "user_applications.*",
      "users.name",
      "users.email",
      "users.mobile",
      "users.status as user_status",
      db.raw("reviewer.name as reviewed_by_name"),
      db.raw("final_reviewer.name as final_reviewed_by_name"),
    )
    .orderBy("user_applications.created_at", "desc");
}

function enrichApplicationFiles(row) {
  const fileFields = [
    "biosecurity",
    "vaccination",
    "emergency",
    "food_safety",
    "description",
    "farm_biosecurity",
  ];

  const files = {};

  for (const field of fileFields) {
    if (row[field]) {
      try {
        const parsed =
          typeof row[field] === "string" ? JSON.parse(row[field]) : row[field];

        files[field] = {
          ...parsed,
          url: parsed?.path ? buildFileUrl(parsed.path) : null,
        };
      } catch {
        files[field] = null;
      }
    } else {
      files[field] = null;
    }
  }

  return { ...row, files };
}

function buildFileUrl(p) {
  if (!p) return null;
  if (!BASE_URL) return p; // fallback if BASE_URL not set
  const path = p.startsWith("/") ? p : `/${p}`;
  return `${BASE_URL}${path}`;
}

/* =======================================================================
   👥 Containers + Buyer Requests (Super Admin CRUD)
   - No schema changes
   - Keeps *_by / *_at columns
   - Enriches admin_license_keys "by" fields via admin_license_keys.assigned_to -> users
======================================================================= */

/* -------------------- tiny utils -------------------- */
const toNum = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

function pick(obj, keys) {
  const out = {};
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(obj, k)) out[k] = obj[k];
  }
  return out;
}

function assertId(id, name) {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`Invalid ${name}`);
  return n;
}

/* -------------------- existence guards -------------------- */
async function ensureUserExists(userId) {
  const id = assertId(userId, "userId");
  const u = await db("users").select("id").where({ id }).first();
  if (!u) throw new Error("User not found");
  return u;
}

async function ensureBuyerRequestExists(requestId) {
  const id = assertId(requestId, "requestId");
  const r = await db("buyer_requests").where({ id }).first();
  if (!r) throw new Error("Buyer request not found");
  return r;
}

async function ensureContainerExists(containerId, trx = db) {
  const id = assertId(containerId, "containerId");
  const c = await trx("farmer_plan_containers").where({ id }).first();
  if (!c) throw new Error("Container not found");
  return c;
}

async function ensureLicenseKeyExists(licenseId) {
  const id = assertId(licenseId, "licenseId");
  const lk = await db("admin_license_keys")
    .select("id", "assigned_to")
    .where({ id })
    .first();
  if (!lk) throw new Error("License key not found");
  return lk;
}

/**
 * Attach display fields for admin_license_keys "who did what" without changing DB:
 * - qb must already have a leftJoin("admin_license_keys as <licenseAlias>", ...)
 * - then we join users as <prefix>_user by licenseAlias.assigned_to
 * Adds:
 *   <prefix>_license_id
 *   <prefix>_assigned_user_id
 *   <prefix>_assigned_user_name/email/mobile
 */
function joinLicenseAssignedUser(qb, licenseAlias, prefix) {
  const userAlias = `${prefix}_user`;
  qb.leftJoin(
    `users as ${userAlias}`,
    `${userAlias}.id`,
    `${licenseAlias}.assigned_to`,
  );
  qb.select(
    db.raw(`${licenseAlias}.id as ${prefix}_license_id`),
    db.raw(`${licenseAlias}.assigned_to as ${prefix}_assigned_user_id`),
    db.raw(`COALESCE(${userAlias}.name,'') as ${prefix}_assigned_user_name`),
    db.raw(`COALESCE(${userAlias}.email,'') as ${prefix}_assigned_user_email`),
    db.raw(
      `COALESCE(${userAlias}.mobile,'') as ${prefix}_assigned_user_mobile`,
    ),
  );
}

/* =======================================================================
   PLANS helpers
======================================================================= */

/** Ensure a farmer_plan exists for a request (unique request_id). */
async function getOrCreatePlanForRequest(trx, requestId) {
  const existing = await trx("farmer_plans")
    .where({ request_id: requestId })
    .first();
  if (existing) return existing;

  const [created] = await trx("farmer_plans")
    .insert({
      request_id: requestId,
      status: "submitted",
      created_at: trx.fn.now(),
      updated_at: trx.fn.now(),
    })
    .returning("*");

  return created;
}

/** Next available container_no inside a plan (unique(plan_id, container_no)). */
async function nextContainerNo(trx, planId) {
  const row = await trx("farmer_plan_containers")
    .where({ plan_id: planId })
    .max("container_no as m")
    .first();
  return toNum(row?.m) + 1;
}

/* =======================================================================
   BUYER REQUESTS (List / Get / Create / Update / Delete)
======================================================================= */

const SAFE_BR_SORT = new Set([
  "id",
  "created_at",
  "updated_at",
  "status",
  "import_country",
  "allocation_status",
  "order_number",
  "deadline_start",
  "deadline_end",
]);

export async function listBuyerRequests({
  page = 1,
  pageSize = 20,
  search = "",
  status = "",
  import_country = "",
  allocation_status = "",
  sort = "created_at",
  dir = "desc",
} = {}) {
  page = Math.max(1, toNum(page) || 1);
  pageSize = Math.min(100, Math.max(1, toNum(pageSize) || 20));
  if (!SAFE_BR_SORT.has(sort)) sort = "created_at";
  dir = String(dir).toLowerCase() === "asc" ? "asc" : "desc";

  const base = db("buyer_requests as br")
    .leftJoin("users as buyer", "buyer.id", "br.buyer_id")
    .leftJoin("users as creator", "creator.id", "br.creator_id")
    .leftJoin(
      "users as pref_supplier",
      "pref_supplier.id",
      "br.preferred_supplier_id",
    )
    .leftJoin("admin_license_keys as br_rev", "br_rev.id", "br.reviewed_by")
    .select(
      "br.*",
      db.raw(`COALESCE(buyer.name, '') as buyer_name`),
      db.raw(`COALESCE(buyer.mobile, '') as buyer_mobile`),
      db.raw(`COALESCE(buyer.email, '') as buyer_email`),
      db.raw(`COALESCE(creator.name, '') as creator_name`),
      db.raw(`COALESCE(creator.mobile, '') as creator_mobile`),
      db.raw(
        `COALESCE(pref_supplier.name, '') as preferred_supplier_user_name`,
      ),
      db.raw(
        `COALESCE(pref_supplier.mobile, '') as preferred_supplier_user_mobile`,
      ),
    )
    .modify((qb) =>
      joinLicenseAssignedUser(qb, "br_rev", "buyer_request_reviewed_by"),
    );

  if (status) base.where("br.status", status);
  if (import_country) base.where("br.import_country", import_country);
  if (allocation_status) base.where("br.allocation_status", allocation_status);

  if (search) {
    const s = `%${String(search).toLowerCase()}%`;
    base.andWhere((q) => {
      q.whereRaw("LOWER(COALESCE(buyer.name,'')) LIKE ?", [s])
        .orWhereRaw("LOWER(COALESCE(buyer.mobile,'')) LIKE ?", [s])
        .orWhereRaw("LOWER(COALESCE(br.order_number,'')) LIKE ?", [s])
        .orWhereRaw("LOWER(COALESCE(br.import_country,'')) LIKE ?", [s])
        .orWhereRaw("CAST(br.id AS TEXT) LIKE ?", [`%${String(search)}%`]);
    });
  }

  const countRow = await base
    .clone()
    .clearSelect()
    .clearOrder()
    .countDistinct("br.id as c")
    .first();
  const total = toNum(countRow?.c);

  const rows = await base
    .orderBy(`br.${sort}`, dir)
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return { page, pageSize, total, rows };
}

export async function createBuyerRequest(payload = {}) {
  const allowed = [
    "buyer_id",
    "status",
    "size",
    "expiration_date",
    "certificates",
    "import_country",
    "entry_border",
    "exit_border",
    "preferred_supplier_name",
    "preferred_supplier_id",
    "packaging",
    "egg_type",
    "container_amount",
    "expiration_days",
    "transport_type",
    "product_type",
    "cartons",
    "description",
    "creator_id",
    "admin_extra_files",
    "deadline_start",
    "deadline_end",
    "order_number",
    "allocated_containers",
    "allocation_status",
    "reviewed_by",
    "reviewed_at",
  ];

  const data = pick(payload, allowed);

  assertId(data.buyer_id, "buyer_id");
  await ensureUserExists(data.buyer_id);

  if (data.creator_id) await ensureUserExists(data.creator_id);
  if (data.preferred_supplier_id)
    await ensureUserExists(data.preferred_supplier_id);
  if (data.reviewed_by) await ensureLicenseKeyExists(data.reviewed_by);

  const [created] = await db("buyer_requests")
    .insert({
      ...data,
      created_at: db.fn.now(),
      updated_at: db.fn.now(),
    })
    .returning("*");

  return created;
}

export async function updateBuyerRequest(requestId, payload = {}) {
  const id = assertId(requestId, "requestId");
  await ensureBuyerRequestExists(id);

  const allowed = [
    "buyer_id",
    "status",
    "size",
    "expiration_date",
    "certificates",
    "import_country",
    "entry_border",
    "exit_border",
    "preferred_supplier_name",
    "preferred_supplier_id",
    "packaging",
    "egg_type",
    "container_amount",
    "expiration_days",
    "transport_type",
    "product_type",
    "cartons",
    "description",
    "creator_id",
    "admin_extra_files",
    "deadline_start",
    "deadline_end",
    "order_number",
    "allocated_containers",
    "allocation_status",
    "reviewed_by",
    "reviewed_at",
  ];

  const patch = pick(payload, allowed);

  if (patch.buyer_id) await ensureUserExists(patch.buyer_id);
  if (patch.creator_id) await ensureUserExists(patch.creator_id);
  if (patch.preferred_supplier_id)
    await ensureUserExists(patch.preferred_supplier_id);
  if (patch.reviewed_by) await ensureLicenseKeyExists(patch.reviewed_by);

  const [updated] = await db("buyer_requests")
    .where({ id })
    .update({ ...patch, updated_at: db.fn.now() })
    .returning("*");

  return updated;
}

export async function getBuyerRequest(
  requestId,
  { includeContainers = true } = {},
) {
  const id = assertId(requestId, "requestId");

  const br = await db("buyer_requests as br")
    .leftJoin("users as buyer", "buyer.id", "br.buyer_id")
    .leftJoin("users as creator", "creator.id", "br.creator_id")
    .leftJoin(
      "users as pref_supplier",
      "pref_supplier.id",
      "br.preferred_supplier_id",
    )
    .leftJoin("admin_license_keys as br_rev", "br_rev.id", "br.reviewed_by")
    .select(
      "br.*",
      db.raw(`COALESCE(buyer.name, '') as buyer_name`),
      db.raw(`COALESCE(buyer.mobile, '') as buyer_mobile`),
      db.raw(`COALESCE(buyer.email, '') as buyer_email`),
      db.raw(`COALESCE(creator.name, '') as creator_name`),
      db.raw(`COALESCE(creator.mobile, '') as creator_mobile`),
      db.raw(`COALESCE(creator.email, '') as creator_email`),
      db.raw(
        `COALESCE(pref_supplier.name, '') as preferred_supplier_user_name`,
      ),
      db.raw(
        `COALESCE(pref_supplier.mobile, '') as preferred_supplier_user_mobile`,
      ),
    )
    .modify((qb) =>
      joinLicenseAssignedUser(qb, "br_rev", "buyer_request_reviewed_by"),
    )
    .where("br.id", id)
    .first();

  if (!br) throw new Error("Buyer request not found");

  const plan = await db("farmer_plans as fp")
    .leftJoin("admin_license_keys as fp_rev", "fp_rev.id", "fp.reviewed_by")
    .select("fp.*")
    .modify((qb) => joinLicenseAssignedUser(qb, "fp_rev", "plan_reviewed_by"))
    .where("fp.request_id", id)
    .first();

  const containers = includeContainers
    ? await listBuyerRequestContainers(id)
    : [];

  return { buyerRequest: br, plan: plan || null, containers };
}

/**
 * Hard delete buyer request + related plan + containers + related records.
 * Because FKs aren’t ON DELETE CASCADE.
 *
 * IMPORTANT: We delete containers that are either:
 * - directly linked by buyer_request_id = requestId
 * - OR linked through the plan_id for this request (if plan exists)
 */
export async function deleteBuyerRequest(requestId) {
  const id = assertId(requestId, "requestId");

  return db.transaction(async (trx) => {
    const br = await trx("buyer_requests").where({ id }).first();
    if (!br) throw new Error("Buyer request not found");

    const plan = await trx("farmer_plans").where({ request_id: id }).first();
    const planId = plan?.id || null;

    const containersQ = trx("farmer_plan_containers").select("id");
    containersQ.where("buyer_request_id", id);
    if (planId) containersQ.orWhere("plan_id", planId);

    const containers = await containersQ;
    const containerIds = containers.map((x) => x.id);

    if (containerIds.length) {
      await trx("farmer_plan_files")
        .whereIn("container_id", containerIds)
        .del();
      await trx("external_qc_reports")
        .whereIn("container_id", containerIds)
        .del();
      await trx("internal_qc_hold_resolutions")
        .whereIn("container_id", containerIds)
        .del();
      await trx("container_tracking_statuses")
        .whereIn("container_id", containerIds)
        .del();
      await trx("farmer_plan_containers").whereIn("id", containerIds).del();
    }

    if (planId) await trx("farmer_plans").where({ id: planId }).del();

    await trx("buyer_requests").where({ id }).del();

    return {
      ok: true,
      deletedRequestId: id,
      deletedPlanId: planId,
      deletedContainers: containerIds.length,
    };
  });
}

/* =======================================================================
   CONTAINERS (List under request / Global list / Create / Get / Update / Delete)
======================================================================= */

export async function listBuyerRequestContainers(requestId) {
  const id = assertId(requestId, "requestId");
  await ensureBuyerRequestExists(id);

  const rows = await db("farmer_plan_containers as c")
    .leftJoin("users as supplier", "supplier.id", "c.supplier_id")
    .leftJoin("farmer_plans as fp", "fp.id", "c.plan_id")
    .leftJoin("buyer_requests as br", "br.id", "c.buyer_request_id")
    .select(
      "c.*",
      db.raw(`COALESCE(supplier.name,'') as supplier_name`),
      db.raw(`COALESCE(supplier.mobile,'') as supplier_mobile`),
      db.raw(`fp.request_id as plan_request_id`),
      db.raw(`br.import_country as buyer_request_import_country`),
      db.raw(`br.order_number as buyer_request_order_number`),
    )
    .where("c.buyer_request_id", id)
    .orderBy("c.id", "desc");

  return rows;
}

const SAFE_C_SORT = new Set([
  "id",
  "created_at",
  "updated_at",
  "status",
  "qc_status",
  "container_no",
  "completed_at",
  "plan_date",
]);

export async function listContainers({
  page = 1,
  pageSize = 20,
  search = "",
  status = "",
  qc_status = "",
  supplier_id = null,
  buyer_request_id = null,
  plan_id = null,
  import_country = "",
  sort = "created_at",
  dir = "desc",
} = {}) {
  page = Math.max(1, toNum(page) || 1);
  pageSize = Math.min(100, Math.max(1, toNum(pageSize) || 20));
  if (!SAFE_C_SORT.has(sort)) sort = "created_at";
  dir = String(dir).toLowerCase() === "asc" ? "asc" : "desc";

  const base = db("farmer_plan_containers as c")
    .leftJoin("users as supplier", "supplier.id", "c.supplier_id")
    .leftJoin("buyer_requests as br", "br.id", "c.buyer_request_id")
    .leftJoin("users as buyer", "buyer.id", "br.buyer_id")
    .leftJoin("farmer_plans as fp", "fp.id", "c.plan_id")

    // license joins for *_by enrichment on list too (so super admin sees them)
    .leftJoin("admin_license_keys as c_rev", "c_rev.id", "c.reviewed_by")
    .leftJoin("admin_license_keys as qc_rev", "qc_rev.id", "c.qc_reviewed_by")

    .select(
      "c.*",
      db.raw(`COALESCE(supplier.name,'') as supplier_name`),
      db.raw(`COALESCE(supplier.mobile,'') as supplier_mobile`),

      db.raw(`COALESCE(buyer.name,'') as buyer_name`),
      db.raw(`COALESCE(buyer.mobile,'') as buyer_mobile`),

      db.raw(`br.import_country as buyer_request_import_country`),
      db.raw(`br.order_number as buyer_request_order_number`),
      db.raw(`fp.request_id as plan_request_id`),
    )
    .modify((qb) => {
      joinLicenseAssignedUser(qb, "c_rev", "container_reviewed_by");
      joinLicenseAssignedUser(qb, "qc_rev", "qc_reviewed_by");
    });

  if (status) base.where("c.status", status);
  if (qc_status) base.where("c.qc_status", qc_status);
  if (supplier_id)
    base.where("c.supplier_id", assertId(supplier_id, "supplier_id"));
  if (buyer_request_id)
    base.where(
      "c.buyer_request_id",
      assertId(buyer_request_id, "buyer_request_id"),
    );
  if (plan_id) base.where("c.plan_id", assertId(plan_id, "plan_id"));
  if (import_country) base.where("br.import_country", import_country);

  if (search) {
    const s = `%${String(search).toLowerCase()}%`;
    base.andWhere((q) => {
      q.whereRaw("LOWER(COALESCE(buyer.name,'')) LIKE ?", [s])
        .orWhereRaw("LOWER(COALESCE(buyer.mobile,'')) LIKE ?", [s])
        .orWhereRaw("LOWER(COALESCE(supplier.name,'')) LIKE ?", [s])
        .orWhereRaw("LOWER(COALESCE(supplier.mobile,'')) LIKE ?", [s])
        .orWhereRaw("LOWER(COALESCE(br.order_number,'')) LIKE ?", [s])
        .orWhereRaw("LOWER(COALESCE(br.import_country,'')) LIKE ?", [s])
        .orWhereRaw("CAST(c.id AS TEXT) LIKE ?", [`%${String(search)}%`])
        .orWhereRaw("CAST(c.container_no AS TEXT) LIKE ?", [
          `%${String(search)}%`,
        ])
        .orWhereRaw("LOWER(COALESCE(c.tracking_code,'')) LIKE ?", [s]);
    });
  }

  const countRow = await base
    .clone()
    .clearSelect()
    .clearOrder()
    .countDistinct("c.id as c")
    .first();
  const total = toNum(countRow?.c);

  const rows = await base
    .orderBy(`c.${sort}`, dir)
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return { page, pageSize, total, rows };
}

export async function createContainerForRequest(requestId, payload = {}) {
  const rid = assertId(requestId, "requestId");
  await ensureBuyerRequestExists(rid);

  const allowed = [
    "container_no",
    "status",
    "reviewed_by",
    "reviewed_at",

    "metadata",
    "metadata_status",
    "metadata_review_note",
    "metadata_reviewed_by",
    "metadata_reviewed_at",

    "admin_metadata",
    "admin_metadata_status",
    "admin_metadata_review_note",
    "admin_metadata_reviewed_by",
    "admin_metadata_reviewed_at",

    "supplier_id",
    "farmer_status",
    "is_completed",
    "in_progress",

    "transport_info",
    "tracking_code",
    "completed_at",
    "plan_date",
    "is_rejected",

    "qc_status",
    "qc_reviewed_by",
    "qc_reviewed_at",
    "qc_note",
    "qc_hold_reason",
    "qc_hold_details",
    "qc_arrival_info",
    "qc_inspection_info",
  ];

  const data = pick(payload, allowed);

  // validate license ids if present
  if (data.reviewed_by) await ensureLicenseKeyExists(data.reviewed_by);
  if (data.metadata_reviewed_by)
    await ensureLicenseKeyExists(data.metadata_reviewed_by);
  if (data.admin_metadata_reviewed_by)
    await ensureLicenseKeyExists(data.admin_metadata_reviewed_by);
  if (data.qc_reviewed_by) await ensureLicenseKeyExists(data.qc_reviewed_by);

  if (data.supplier_id) await ensureUserExists(data.supplier_id);

  return db.transaction(async (trx) => {
    const plan = await getOrCreatePlanForRequest(trx, rid);

    let containerNo = toNum(data.container_no);
    if (!containerNo) containerNo = await nextContainerNo(trx, plan.id);

    // unique(plan_id, container_no)
    const conflict = await trx("farmer_plan_containers")
      .where({ plan_id: plan.id, container_no: containerNo })
      .first();
    if (conflict) throw new Error("container_no already exists in this plan");

    const [created] = await trx("farmer_plan_containers")
      .insert({
        ...data,
        plan_id: plan.id,
        buyer_request_id: rid,
        container_no: containerNo,
        created_at: trx.fn.now(),
        updated_at: trx.fn.now(),
      })
      .returning("*");

    return created;
  });
}

export async function getContainer(containerId) {
  const cid = assertId(containerId, "containerId");

  const c = await db("farmer_plan_containers as c")
    .leftJoin("users as supplier", "supplier.id", "c.supplier_id")
    .leftJoin("buyer_requests as br", "br.id", "c.buyer_request_id")
    .leftJoin("users as buyer", "buyer.id", "br.buyer_id")
    .leftJoin("farmer_plans as fp", "fp.id", "c.plan_id")

    // reviewers (license ids)
    .leftJoin("admin_license_keys as c_rev", "c_rev.id", "c.reviewed_by")
    .leftJoin(
      "admin_license_keys as meta_rev",
      "meta_rev.id",
      "c.metadata_reviewed_by",
    )
    .leftJoin(
      "admin_license_keys as adm_meta_rev",
      "adm_meta_rev.id",
      "c.admin_metadata_reviewed_by",
    )
    .leftJoin("admin_license_keys as qc_rev", "qc_rev.id", "c.qc_reviewed_by")

    .select(
      "c.*",

      db.raw(`COALESCE(supplier.name,'') as supplier_name`),
      db.raw(`COALESCE(supplier.mobile,'') as supplier_mobile`),

      db.raw(`br.id as buyer_request_id`),
      db.raw(`br.status as buyer_request_status`),
      db.raw(`br.import_country as buyer_request_import_country`),
      db.raw(`br.order_number as buyer_request_order_number`),
      db.raw(`br.reviewed_by as buyer_request_reviewed_by_id`),
      db.raw(`br.reviewed_at as buyer_request_reviewed_at`),

      db.raw(`COALESCE(buyer.name,'') as buyer_name`),
      db.raw(`COALESCE(buyer.mobile,'') as buyer_mobile`),

      db.raw(`fp.id as plan_id`),
      db.raw(`fp.status as plan_status`),
      db.raw(`fp.plan_date as plan_plan_date`),
      db.raw(`fp.request_id as plan_request_id`),
      db.raw(`fp.reviewed_by as plan_reviewed_by_id`),
      db.raw(`fp.reviewed_at as plan_reviewed_at`),
    )
    .modify((qb) => {
      joinLicenseAssignedUser(qb, "c_rev", "container_reviewed_by");
      joinLicenseAssignedUser(qb, "meta_rev", "metadata_reviewed_by");
      joinLicenseAssignedUser(qb, "adm_meta_rev", "admin_metadata_reviewed_by");
      joinLicenseAssignedUser(qb, "qc_rev", "qc_reviewed_by");
    })
    .where("c.id", cid)
    .first();

  if (!c) throw new Error("Container not found");

  const files = await db("farmer_plan_files as f")
    .leftJoin("admin_license_keys as f_rev", "f_rev.id", "f.reviewed_by")
    .select("f.*")
    .modify((qb) => joinLicenseAssignedUser(qb, "f_rev", "file_reviewed_by"))
    .where("f.container_id", cid)
    .orderBy("f.id", "desc");

  const externalQc = await db("external_qc_reports as r")
    .leftJoin("admin_license_keys as qc_lk", "qc_lk.id", "r.qc_license_id")
    .select("r.*")
    .modify((qb) => joinLicenseAssignedUser(qb, "qc_lk", "qc_license"))
    .where("r.container_id", cid)
    .first();

  const holdResolutions = await db("internal_qc_hold_resolutions as h")
    .leftJoin("admin_license_keys as h_lk", "h_lk.id", "h.resolved_by")
    .select("h.*")
    .modify((qb) => joinLicenseAssignedUser(qb, "h_lk", "resolved_by"))
    .where("h.container_id", cid)
    .orderBy("h.id", "desc");

  const trackingStatuses = await db("container_tracking_statuses as t")
    .leftJoin("users as u", "u.id", "t.created_by")
    .select(
      "t.*",
      db.raw(`COALESCE(u.name,'') as created_by_name`),
      db.raw(`COALESCE(u.mobile,'') as created_by_mobile`),
    )
    .where("t.container_id", cid)
    .orderBy("t.created_at", "desc");

  return {
    container: c,
    files,
    externalQc: externalQc || null,
    holdResolutions,
    trackingStatuses,
  };
}

export async function updateContainer(containerId, payload = {}) {
  const cid = assertId(containerId, "containerId");
  const existing = await ensureContainerExists(cid);

  const allowed = [
    "container_no",
    "status",
    "reviewed_by",
    "reviewed_at",

    "metadata",
    "metadata_status",
    "metadata_review_note",
    "metadata_reviewed_by",
    "metadata_reviewed_at",

    "admin_metadata",
    "admin_metadata_status",
    "admin_metadata_review_note",
    "admin_metadata_reviewed_by",
    "admin_metadata_reviewed_at",

    "supplier_id",
    "farmer_status",
    "is_completed",
    "in_progress",

    "buyer_request_id", // allow superadmin direct set (careful: plan consistency should be handled via transfer)
    "transport_info",
    "tracking_code",
    "completed_at",
    "plan_date",
    "is_rejected",

    "qc_status",
    "qc_reviewed_by",
    "qc_reviewed_at",
    "qc_note",
    "qc_hold_reason",
    "qc_hold_details",
    "qc_arrival_info",
    "qc_inspection_info",
  ];

  const patch = pick(payload, allowed);

  // validate license ids if present
  if (patch.reviewed_by) await ensureLicenseKeyExists(patch.reviewed_by);
  if (patch.metadata_reviewed_by)
    await ensureLicenseKeyExists(patch.metadata_reviewed_by);
  if (patch.admin_metadata_reviewed_by)
    await ensureLicenseKeyExists(patch.admin_metadata_reviewed_by);
  if (patch.qc_reviewed_by) await ensureLicenseKeyExists(patch.qc_reviewed_by);

  if (patch.supplier_id) await ensureUserExists(patch.supplier_id);

  if (patch.buyer_request_id) {
    await ensureBuyerRequestExists(patch.buyer_request_id);
    // NOTE: We do NOT auto-change plan_id here. For full move use transferContainer().
  }

  // If container_no changes, must respect unique(plan_id, container_no)
  if (
    patch.container_no &&
    toNum(patch.container_no) !== toNum(existing.container_no)
  ) {
    const conflict = await db("farmer_plan_containers")
      .where({
        plan_id: existing.plan_id,
        container_no: toNum(patch.container_no),
      })
      .andWhereNot({ id: cid })
      .first();
    if (conflict) throw new Error("container_no already exists in this plan");
  }

  const [updated] = await db("farmer_plan_containers")
    .where({ id: cid })
    .update({ ...patch, updated_at: db.fn.now() })
    .returning("*");

  return updated;
}

export async function deleteContainer(containerId) {
  const cid = assertId(containerId, "containerId");

  return db.transaction(async (trx) => {
    const c = await trx("farmer_plan_containers").where({ id: cid }).first();
    if (!c) throw new Error("Container not found");

    await trx("farmer_plan_files").where({ container_id: cid }).del();
    await trx("external_qc_reports").where({ container_id: cid }).del();
    await trx("internal_qc_hold_resolutions")
      .where({ container_id: cid })
      .del();
    await trx("container_tracking_statuses").where({ container_id: cid }).del();
    await trx("farmer_plan_containers").where({ id: cid }).del();

    return { ok: true, deletedContainerId: cid };
  });
}

/* =======================================================================
   CONTAINER ACTIONS (Transfer / Change Supplier)
======================================================================= */

export async function transferContainer(
  containerId,
  { toBuyerRequestId, containerNo = null } = {},
) {
  const cid = assertId(containerId, "containerId");
  const toRid = assertId(toBuyerRequestId, "toBuyerRequestId");

  return db.transaction(async (trx) => {
    const c = await trx("farmer_plan_containers").where({ id: cid }).first();
    if (!c) throw new Error("Container not found");

    await ensureBuyerRequestExists(toRid);

    const destPlan = await getOrCreatePlanForRequest(trx, toRid);

    let newNo = containerNo ? toNum(containerNo) : null;
    if (!newNo) newNo = await nextContainerNo(trx, destPlan.id);

    const conflict = await trx("farmer_plan_containers")
      .where({ plan_id: destPlan.id, container_no: newNo })
      .first();
    if (conflict)
      throw new Error("container_no already exists in destination plan");

    const [updated] = await trx("farmer_plan_containers")
      .where({ id: cid })
      .update({
        buyer_request_id: toRid,
        plan_id: destPlan.id,
        container_no: newNo,
        updated_at: trx.fn.now(),
      })
      .returning("*");

    return {
      ok: true,
      moved: {
        containerId: cid,
        fromBuyerRequestId: c.buyer_request_id,
        toBuyerRequestId: toRid,
        fromPlanId: c.plan_id,
        toPlanId: destPlan.id,
        newContainerNo: newNo,
      },
      container: updated,
    };
  });
}

export async function changeContainerSupplier(
  containerId,
  { supplierId } = {},
) {
  const cid = assertId(containerId, "containerId");
  const sid = assertId(supplierId, "supplierId");

  await ensureUserExists(sid);

  const [updated] = await db("farmer_plan_containers")
    .where({ id: cid })
    .update({ supplier_id: sid, updated_at: db.fn.now() })
    .returning("*");

  if (!updated) throw new Error("Container not found");
  return { ok: true, container: updated };
}

/* =======================================================================
   TRACKING STATUSES (container_tracking_statuses)
======================================================================= */

export async function listContainerTrackingStatuses(containerId) {
  const cid = assertId(containerId, "containerId");
  await ensureContainerExists(cid);

  const rows = await db("container_tracking_statuses as t")
    .leftJoin("users as u", "u.id", "t.created_by")
    .select(
      "t.*",
      db.raw(`COALESCE(u.name,'') as created_by_name`),
      db.raw(`COALESCE(u.mobile,'') as created_by_mobile`),
    )
    .where("t.container_id", cid)
    .orderBy("t.created_at", "desc");

  return rows;
}

export async function createContainerTrackingStatus(containerId, payload = {}) {
  const cid = assertId(containerId, "containerId");
  await ensureContainerExists(cid);

  const allowed = [
    "status",
    "note",
    "created_by",
    "created_at",
    "tracking_code",
  ];
  const data = pick(payload, allowed);

  if (!data.status) throw new Error("status is required");
  assertId(data.created_by, "created_by");
  await ensureUserExists(data.created_by);

  // Unique(container_id, tracking_code) — only enforce if tracking_code provided
  if (data.tracking_code) {
    const existing = await db("container_tracking_statuses")
      .where({ container_id: cid, tracking_code: data.tracking_code })
      .first();
    if (existing)
      throw new Error("tracking_code already exists for this container");
  }

  const [created] = await db("container_tracking_statuses")
    .insert({
      ...data,
      container_id: cid,
      created_at: data.created_at || db.fn.now(),
      updated_at: db.fn.now(),
    })
    .returning("*");

  return created;
}

export async function updateContainerTrackingStatus(id, payload = {}) {
  const tid = assertId(id, "id");

  const allowed = [
    "status",
    "note",
    "tracking_code",
    "created_by",
    "created_at",
  ];
  const patch = pick(payload, allowed);

  if (patch.created_by) {
    assertId(patch.created_by, "created_by");
    await ensureUserExists(patch.created_by);
  }

  // if changing tracking_code, must respect unique(container_id, tracking_code)
  if (patch.tracking_code != null) {
    const row = await db("container_tracking_statuses")
      .select("id", "container_id")
      .where({ id: tid })
      .first();
    if (!row) throw new Error("Tracking status not found");

    if (patch.tracking_code) {
      const conflict = await db("container_tracking_statuses")
        .where({
          container_id: row.container_id,
          tracking_code: patch.tracking_code,
        })
        .andWhereNot({ id: tid })
        .first();
      if (conflict)
        throw new Error("tracking_code already exists for this container");
    }
  }

  const [u] = await db("container_tracking_statuses")
    .where({ id: tid })
    .update({ ...patch, updated_at: db.fn.now() })
    .returning("*");

  if (!u) throw new Error("Tracking status not found");
  return u;
}

export async function deleteContainerTrackingStatus(id) {
  const tid = assertId(id, "id");
  const n = await db("container_tracking_statuses").where({ id: tid }).del();
  return { ok: true, deleted: n };
}

/* =======================================================================
   OPTIONAL CRUD: external QC report (upsert/delete)
======================================================================= */

export async function upsertExternalQcReport(containerId, payload = {}) {
  const cid = assertId(containerId, "containerId");
  await ensureContainerExists(cid);

  const allowed = [
    "qc_license_id",
    "actual_quantity",
    "quality_condition",
    "packaging_condition",
    "discrepancies",
    "attachments",
    "confirmed_at",
  ];
  const data = pick(payload, allowed);

  assertId(data.qc_license_id, "qc_license_id");
  await ensureLicenseKeyExists(data.qc_license_id);

  if (!Number.isFinite(toNum(data.actual_quantity)))
    throw new Error("actual_quantity is required");

  return db.transaction(async (trx) => {
    const existing = await trx("external_qc_reports")
      .where({ container_id: cid })
      .first();

    if (existing) {
      const [u] = await trx("external_qc_reports")
        .where({ container_id: cid })
        .update({ ...data, updated_at: trx.fn.now() })
        .returning("*");
      return u;
    }

    const [c] = await trx("external_qc_reports")
      .insert({
        ...data,
        container_id: cid,
        created_at: trx.fn.now(),
        updated_at: trx.fn.now(),
      })
      .returning("*");
    return c;
  });
}

export async function deleteExternalQcReport(containerId) {
  const cid = assertId(containerId, "containerId");
  await ensureContainerExists(cid);

  const n = await db("external_qc_reports").where({ container_id: cid }).del();
  return { ok: true, deleted: n };
}

/* =======================================================================
   OPTIONAL CRUD: internal qc hold resolutions (create/delete)
======================================================================= */

export async function createHoldResolution(containerId, payload = {}) {
  const cid = assertId(containerId, "containerId");
  await ensureContainerExists(cid);

  const allowed = [
    "previous_qc_status",
    "resolution_action",
    "resolution_note",
    "resolved_by",
    "send_back_to_qc",
    "resolved_at",
  ];
  const data = pick(payload, allowed);

  if (!data.previous_qc_status)
    throw new Error("previous_qc_status is required");
  if (!data.resolution_action) throw new Error("resolution_action is required");
  assertId(data.resolved_by, "resolved_by");
  await ensureLicenseKeyExists(data.resolved_by);

  const [created] = await db("internal_qc_hold_resolutions")
    .insert({
      ...data,
      container_id: cid,
      created_at: db.fn.now(),
      resolved_at: data.resolved_at || db.fn.now(),
    })
    .returning("*");

  return created;
}

export async function deleteHoldResolution(id) {
  const hid = assertId(id, "id");
  const n = await db("internal_qc_hold_resolutions").where({ id: hid }).del();
  return { ok: true, deleted: n };
}

/* =======================================================================
   OPTIONAL CRUD: plan files (update/delete)
======================================================================= */

export async function updatePlanFile(fileId, payload = {}) {
  const fid = assertId(fileId, "fileId");

  const allowed = [
    "status",
    "review_note",
    "reviewed_by",
    "reviewed_at",
    "type",
    "file_key",
    "original_name",
    "mime_type",
    "size_bytes",
    "path",
  ];
  const patch = pick(payload, allowed);

  if (patch.reviewed_by) await ensureLicenseKeyExists(patch.reviewed_by);

  const [u] = await db("farmer_plan_files")
    .where({ id: fid })
    .update({ ...patch, updated_at: db.fn.now() })
    .returning("*");

  if (!u) throw new Error("File not found");
  return u;
}

export async function deletePlanFile(fileId) {
  const fid = assertId(fileId, "fileId");
  const n = await db("farmer_plan_files").where({ id: fid }).del();
  return { ok: true, deleted: n };
}
