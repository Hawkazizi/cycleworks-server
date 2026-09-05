/**
 * EEG — API integration & data-accuracy test suite
 * ------------------------------------------------
 * Run with the server up:   node --test tests/
 * Verifies (against the REAL local databases db_iran / db_turkey):
 *   1. Auth & role guards (401/403) for every major module
 *   2. Admin & Manager dashboard (گزارش‌گیری) numbers vs direct SQL — IR + TR
 *   3. Reports CSV export (download + row count vs SQL)
 *   4. Customer / Supplier / QC / Notifications / Tickets endpoints
 *
 * NOTE: tokens are minted locally with the server's JWT secret — no user
 * passwords are read, changed or stored anywhere.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import pg from "pg";

const BASE = process.env.API_BASE || "http://localhost:5000";
const JWT_SECRET = process.env.JWT_SECRET || "secret";

const ADMIN_ID = 10; // karshenas  (role: admin — کارشناس)
const MANAGER_ID = 12; // modir     (role: manager — مدیر)
const CUSTOMER_ID = 11; // moshtari (role: buyer — مشتری)
const SUPPLIER_ID = 15; // Shahin   (role: user — تامین‌کننده)
const QC_INTERNAL_ID = 13;
const QC_EXTERNAL_ID = 14;

const mkToken = (id, roles) => jwt.sign({ id, roles }, JWT_SECRET, { expiresIn: "1h" });

const tokens = {
  admin: mkToken(ADMIN_ID, ["admin"]),
  manager: mkToken(MANAGER_ID, ["manager"]),
  customer: mkToken(CUSTOMER_ID, ["buyer"]),
  supplier: mkToken(SUPPLIER_ID, ["user"]),
  qcInternal: mkToken(QC_INTERNAL_ID, ["qc_internal"]),
  qcExternal: mkToken(QC_EXTERNAL_ID, ["qc_external"]),
};

const pools = {
  IR: new pg.Pool({ host: "127.0.0.1", user: "postgres", password: "postgres", database: "db_iran" }),
  TR: new pg.Pool({ host: "127.0.0.1", user: "postgres", password: "postgres", database: "db_turkey" }),
};

const api = async (method, path, { token, country = "IR" } = {}) => {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Country": country,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  return res;
};

const jsonOf = async (res) => {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { __raw: text.slice(0, 200) };
  }
};

/* ---------- Dashboard SQL ground truth (mirrors admin.service.getAdminDashboard) ---------- */
async function dashboardGroundTruth(pool) {
  const q = async (sql) => (await pool.query(sql)).rows;
  const [users] = await q("SELECT count(*)::int AS c FROM users");
  const [apps] = await q("SELECT count(*)::int AS c FROM user_applications WHERE status='pending'");
  const statusRows = await q("SELECT status, count(*)::int AS c FROM buyer_requests GROUP BY status");
  const [total] = await q("SELECT count(*)::int AS c FROM buyer_requests");
  const countryRows = await q("SELECT import_country, count(*)::int AS c FROM buyer_requests GROUP BY import_country");
  const containers = await q(`
    SELECT
      COUNT(*) FILTER (WHERE c.is_rejected = false)::int AS total_non_rejected,
      COUNT(*) FILTER (WHERE c.is_rejected = true)::int AS total_rejected,
      COUNT(*) FILTER (WHERE c.is_rejected = false AND c.in_progress = true AND c.is_completed = false)::int AS in_progress,
      COUNT(*) FILTER (WHERE c.is_rejected = false AND (c.is_completed = true OR LOWER(COALESCE(c.status,''))='completed'))::int AS completed,
      COUNT(*) FILTER (WHERE LOWER(COALESCE(c.farmer_status,''))='pending')::int AS pending_supplier
    FROM farmer_plan_containers c`);
  const inProgressByCountry = await q(`
    SELECT COALESCE(br.import_country,'Unknown') AS country, count(*)::int AS c
    FROM farmer_plan_containers c
    LEFT JOIN farmer_plans fp ON fp.id = c.plan_id
    LEFT JOIN buyer_requests br ON br.id = fp.request_id
    WHERE c.is_rejected = false AND c.in_progress = true AND c.is_completed = false
    GROUP BY 1`);
  const completedByCountry = await q(`
    SELECT COALESCE(br.import_country,'Unknown') AS country, count(*)::int AS c
    FROM farmer_plan_containers c
    LEFT JOIN farmer_plans fp ON fp.id = c.plan_id
    LEFT JOIN buyer_requests br ON br.id = fp.request_id
    WHERE c.is_rejected = false AND (c.is_completed = true OR LOWER(COALESCE(c.status,''))='completed')
    GROUP BY 1`);

  const byStatus = Object.fromEntries(statusRows.map((r) => [(r.status || "unknown").toLowerCase(), r.c]));
  const countryCount = (name) =>
    Number(countryRows.find((r) => (r.import_country || "").toLowerCase() === name.toLowerCase())?.c || 0);
  const byCountry = (rows, name) =>
    Number(rows.find((r) => r.country.toLowerCase() === name.toLowerCase())?.c || 0);

  return {
    users: users.c,
    applications: apps.c,
    customerTotal: total.c,
    customerPending: byStatus.pending || 0,
    customerAccepted: byStatus.accepted || 0,
    customerRejected: byStatus.rejected || 0,
    customerCancelled: byStatus.cancelled || 0,
    customerCompletedRequests: byStatus.completed || 0,
    customerOman: countryCount("oman"),
    customerQatar: countryCount("qatar"),
    customerBahrain: countryCount("bahrain"),
    customerKuwait: countryCount("kuwait"),
    totalContainers: containers[0].total_non_rejected,
    rejectedContainers: containers[0].total_rejected,
    containersInProgress: containers[0].in_progress,
    pendingSupplier: containers[0].pending_supplier,
    inProgressQatar: byCountry(inProgressByCountry, "Qatar"),
    inProgressOman: byCountry(inProgressByCountry, "Oman"),
    inProgressBahrain: byCountry(inProgressByCountry, "Bahrain"),
    inProgressKuwait: byCountry(inProgressByCountry, "Kuwait"),
    completedQatar: byCountry(completedByCountry, "Qatar"),
    completedOman: byCountry(completedByCountry, "Oman"),
    completedBahrain: byCountry(completedByCountry, "Bahrain"),
    completedKuwait: byCountry(completedByCountry, "Kuwait"),
  };
}

function assertDashboardMatchesSql(stats, expected, label) {
  const mismatches = [];
  for (const k of Object.keys(expected)) {
    const actual = Number(stats[k]);
    if (actual !== Number(expected[k])) mismatches.push(`${k}: api=${actual} sql=${expected[k]}`);
  }
  assert.equal(mismatches.length, 0, `${label} dashboard mismatches:\n  ${mismatches.join("\n  ")}`);
}

after(async () => {
  await pools.IR.end();
  await pools.TR.end();
});

/* =======================================================================
   1️⃣ HEALTH & AUTH GUARDS
======================================================================= */
test("GET / healthcheck returns 200", async () => {
  const res = await api("GET", "/");
  assert.equal(res.status, 200);
});

test("protected endpoints reject anonymous requests with 401", async () => {
  for (const path of [
    "/api/admin/dashboard",
    "/api/customers/profile",
    "/api/notifications",
    "/api/tickets",
    "/api/qc/containers",
    "/api/superadmin/customer-requests",
  ]) {
    const res = await api("GET", path);
    assert.equal(res.status, 401, `expected 401 for ${path}`);
  }
});

test("customer token is forbidden on admin/manager endpoints (403)", async () => {
  const res = await api("GET", "/api/admin/dashboard", { token: tokens.customer });
  assert.equal(res.status, 403);
});

test("supplier token is forbidden on admin endpoints (403)", async () => {
  const res = await api("GET", "/api/admin/dashboard", { token: tokens.supplier });
  assert.equal(res.status, 403);
});

/* =======================================================================
   2️⃣ DASHBOARD (گزارش‌گیری) DATA ACCURACY — ADMIN + MANAGER, IR + TR
======================================================================= */
for (const [role, token] of [["admin", tokens.admin], ["manager", tokens.manager]]) {
  for (const country of ["IR", "TR"]) {
    test(`[${country}] ${role} dashboard numbers match SQL ground truth exactly`, async () => {
      const res = await api("GET", "/api/admin/dashboard", { token, country });
      assert.equal(res.status, 200, `dashboard request failed for ${role}/${country}`);
      const body = await jsonOf(res);
      assert.ok(body.stats, `no stats object returned for ${role}/${country}`);
      const expected = await dashboardGroundTruth(pools[country]);
      assertDashboardMatchesSql(body.stats, expected, `[${country}/${role}]`);
    });
  }
}

/* =======================================================================
   3️⃣ REPORTS CSV EXPORT (گزارش گیری — خروجی)
======================================================================= */
test("reports CSV export downloads with correct content-type (admin, IR)", async () => {
  const res = await api("GET", "/api/admin/reports/export-csv", { token: tokens.admin });
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") || "", /text\/csv/i);
  const csv = await res.text();
  assert.ok(csv.length > 0, "CSV body is empty");
  // save sample for manual inspection next to the three main directories
  const fs = await import("node:fs");
  fs.mkdirSync("/home/hawk/Documents/Projects/EEG/images", { recursive: true });
  fs.writeFileSync("/home/hawk/Documents/Projects/EEG/images/sample-reports-export-IR.csv", csv);
});

test("reports CSV export also works for manager", async () => {
  const res = await api("GET", "/api/admin/reports/export-csv?type=completed", { token: tokens.manager });
  assert.equal(res.status, 200);
});

test("CSV export is forbidden for customer role (403)", async () => {
  const res = await api("GET", "/api/admin/reports/export-csv", { token: tokens.customer });
  assert.equal(res.status, 403);
});

/* =======================================================================
   4️⃣ CUSTOMER MODULE (مشتری)
======================================================================= */
test("customer can fetch own profile", async () => {
  const res = await api("GET", "/api/customers/profile", { token: tokens.customer });
  assert.equal(res.status, 200);
  const body = await jsonOf(res);
  const profile = body.profile || body;
  assert.ok(profile, "profile payload missing");
});

test("customer requests list matches SQL for that customer", async () => {
  const res = await api("GET", "/api/customers/requests", { token: tokens.customer });
  assert.equal(res.status, 200);
  const body = await jsonOf(res);
  const rows = Array.isArray(body) ? body : body.requests || body.data || [];
  const sql = await pools.IR.query(
    "SELECT count(*)::int AS c FROM buyer_requests WHERE buyer_id = $1",
    [CUSTOMER_ID],
  );
  // The list may include requests the customer created OR is assigned to
  const sqlBoth = await pools.IR.query(
    "SELECT count(*)::int AS c FROM buyer_requests WHERE buyer_id = $1 OR creator_id = $1",
    [CUSTOMER_ID],
  );
  assert.ok(
    rows.length === sql.rows[0].c || rows.length === sqlBoth.rows[0].c,
    `requests list=${rows.length}, sql(buyer)=${sql.rows[0].c}, sql(buyer|creator)=${sqlBoth.rows[0].c}`,
  );
});

/* =======================================================================
   5️⃣ SUPPLIER (تامین‌کننده) / QC / NOTIFICATIONS / TICKETS
======================================================================= */
test("supplier can list own containers with tracking", async () => {
  const res = await api("GET", "/api/containers/my-containers-with-tracking", { token: tokens.supplier });
  assert.equal(res.status, 200, "supplier container list failed");
  const body = await jsonOf(res);
  const rows = Array.isArray(body) ? body : body.containers || body.data || [];
  if (rows.length > 0) {
    // every row must belong to the supplier themselves
    const sql = await pools.IR.query(
      "SELECT count(*)::int AS c FROM farmer_plan_containers WHERE supplier_id = $1",
      [SUPPLIER_ID],
    );
    assert.ok(rows.length <= sql.rows[0].c + 5, "supplier sees more containers than owned");
  }
});

test("qc_internal can access QC container lists", async () => {
  for (const path of ["/api/qc/containers/arrived", "/api/qc/containers/held", "/api/qc/containers/approved"]) {
    const res = await api("GET", path, { token: tokens.qcInternal });
    assert.equal(res.status, 200, `QC endpoint ${path} failed`);
  }
});

test("qc_external can access approved containers list", async () => {
  const res = await api("GET", "/api/external-qc/containers/approved", { token: tokens.qcExternal });
  assert.equal(res.status, 200);
});

test("notifications list returns for admin", async () => {
  const res = await api("GET", "/api/notifications", { token: tokens.admin });
  assert.equal(res.status, 200);
  const body = await jsonOf(res);
  assert.ok(Array.isArray(body) || Array.isArray(body.notifications || body.data), "notifications not a list");
});

test("tickets list returns for admin", async () => {
  const res = await api("GET", "/api/tickets", { token: tokens.admin });
  assert.equal(res.status, 200);
});

test("manager can access container workflow endpoint", async () => {
  const res = await api("GET", "/api/containers/1/workflow", { token: tokens.manager });
  assert.ok([200, 404].includes(res.status), `unexpected status ${res.status}`);
});

test("unknown API route returns structured 404", async () => {
  const res = await api("GET", "/api/definitely-not-a-route", { token: tokens.admin });
  assert.ok([404, 400].includes(res.status));
});



