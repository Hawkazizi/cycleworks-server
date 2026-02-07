import db from "../../db/knex.js";

export const getProfile = async ({ userId, licenseId }) => {
  const user = await db("users")
    .select(
      "id",
      "name",
      "email",
      "mobile",
      "status",
      "profile_picture",
      "created_at",
      "updated_at",
    )
    .where({ id: userId })
    .first();

  if (!user) throw new Error("User not found");

  // Prefer licenseId from token (license-based login)
  let license = null;

  if (licenseId) {
    license = await db("admin_license_keys")
      .select(
        "id",
        "key",
        "role_id",
        "country_code",
        "is_active",
        "assigned_to",
      )
      .where({ id: licenseId })
      .first();
  }

  // Fallback: if licenseId not present, try find a license assigned to this user
  if (!license) {
    license = await db("admin_license_keys")
      .select(
        "id",
        "key",
        "role_id",
        "country_code",
        "is_active",
        "assigned_to",
      )
      .where({ assigned_to: userId })
      .orderBy("created_at", "desc")
      .first();
  }

  return {
    ...user,
    license: license
      ? {
          id: license.id,
          is_active: license.is_active,
          country_code: license.country_code,
        }
      : null,
  };
};

/* ---------------- UPDATE PROFILE ---------------- */
export const updateProfile = async (userId, data) => {
  const allowedFields = ["name", "email", "mobile"];

  const updateData = {};
  for (const key of allowedFields) {
    if (data[key] !== undefined) {
      updateData[key] = data[key];
    }
  }

  if (Object.keys(updateData).length === 0) {
    throw new Error("No valid fields to update");
  }

  const [updated] = await db("users")
    .where({ id: userId })
    .update(updateData)
    .returning(["id", "name", "email", "mobile", "updated_at"]);

  if (!updated) throw new Error("Update failed");

  return updated;
};

/**
 * Get all containers visible to the logged-in QC
 */
export const getQcContainers = async ({
  userId,
  page = 1,
  limit = 20,
  qc_status,
  search, // ✅ Changed from container_no to search
  supplier_name,
  sort_by = "created_at",
  sort_direction = "desc",
  start_date,
  end_date,
}) => {
  /* 1️⃣ Get QC license */
  const license = await db("admin_license_keys")
    .where({ assigned_to: userId, is_active: true })
    .first();

  if (!license?.country_code) {
    throw new Error("QC license or country not found");
  }

  /* 2️⃣ Country mapping */
  const COUNTRY_MAP = {
    QA: "Qatar",
    OM: "Oman",
    BA: "Bahrain",
  };

  const importCountry = COUNTRY_MAP[license.country_code];

  if (!importCountry) {
    throw new Error("Invalid QC country mapping");
  }

  /* 3️⃣ Base query */
  const baseQuery = db("farmer_plan_containers as c")
    .join("buyer_requests as br", "br.id", "c.buyer_request_id")
    .leftJoin("users as supplier", "supplier.id", "c.supplier_id")
    .where("br.import_country", importCountry)
    .where("br.status", "accepted");

  /* ✅ GLOBAL stats query (NO qc_status filter EVER) */
  const statsQuery = baseQuery.clone();

  /* 4️⃣ Filters */

  if (qc_status) {
    baseQuery.andWhere("c.qc_status", qc_status);
  }

  /* ✅ UPDATED: Multi-field search */
  if (search) {
    // Remove '#' prefix if present (e.g., "#123" → "123")
    const cleanSearch = search.replace(/^#/, "").trim();

    baseQuery.andWhere(function () {
      // Search by container_no
      this.orWhereRaw("CAST(c.container_no AS TEXT) ILIKE ?", [
        `%${cleanSearch}%`,
      ])
        // Search by tracking_code
        .orWhereRaw("CAST(c.tracking_code AS TEXT) ILIKE ?", [
          `%${cleanSearch}%`,
        ]);

      // Search by ID if it's a valid number
      if (!isNaN(cleanSearch) && cleanSearch !== "") {
        this.orWhere("c.id", "=", parseInt(cleanSearch, 10));
      }
    });

    // Apply same search to stats query
    statsQuery.andWhere(function () {
      this.orWhereRaw("CAST(c.container_no AS TEXT) ILIKE ?", [
        `%${cleanSearch}%`,
      ]).orWhereRaw("CAST(c.tracking_code AS TEXT) ILIKE ?", [
        `%${cleanSearch}%`,
      ]);

      if (!isNaN(cleanSearch) && cleanSearch !== "") {
        this.orWhere("c.id", "=", parseInt(cleanSearch, 10));
      }
    });
  }

  if (supplier_name) {
    baseQuery.andWhere("supplier.name", "ilike", `%${supplier_name}%`);
    statsQuery.andWhere("supplier.name", "ilike", `%${supplier_name}%`);
  }

  if (start_date) {
    baseQuery.andWhere("c.created_at", ">=", start_date);
    statsQuery.andWhere("c.created_at", ">=", start_date);
  }

  if (end_date) {
    baseQuery.andWhere("c.created_at", "<=", end_date);
    statsQuery.andWhere("c.created_at", "<=", end_date);
  }

  /* 5️⃣ Count query */
  const [{ count }] = await baseQuery.clone().count("* as count");

  /* 6️⃣ Sorting (safe whitelist) */
  const SORTABLE_COLUMNS = {
    id: "c.id",
    container_no: "c.container_no",
    qc_status: "c.qc_status",
    created_at: "c.created_at",
    supplier_name: "supplier.name",
    import_country: "br.import_country",
  };

  const orderColumn = SORTABLE_COLUMNS[sort_by] || "c.created_at";
  const orderDirection = sort_direction === "asc" ? "asc" : "desc";

  /* 5️⃣-A Status counts (GLOBAL, no pagination) */
  /* GLOBAL status counts (unfiltered by qc_status) */
  const rawStatusCounts = await statsQuery
    .clone()
    .select("c.qc_status")
    .count("* as count")
    .groupBy("c.qc_status");

  const status_counts = {
    pending: 0,
    arrived: 0,
    qc_submitted: 0,
    approved: 0,
    held: 0,
  };

  rawStatusCounts.forEach((row) => {
    status_counts[row.qc_status] = Number(row.count);
  });

  /* 7️⃣ Data query */
  const containers = await baseQuery
    .clone()
    .select(
      "c.id",
      "c.container_no",
      "c.qc_status",
      "c.created_at",
      "c.tracking_code",
      "c.qc_reviewed_at",

      "br.id as buyer_request_id",
      "br.status as buyer_request_status",
      "br.import_country",

      "supplier.name as supplier_name",
    )
    .orderBy(orderColumn, orderDirection)
    .limit(limit)
    .offset((page - 1) * limit);

  /* 8️⃣ Response */
  return {
    country: license.country_code,
    import_country: importCountry,
    containers,
    status_counts,
    pagination: {
      page,
      limit,
      total: Number(count),
      totalPages: Math.ceil(count / limit),
    },
  };
};

export const getQcContainerById = async ({ userId, containerId }) => {
  /* 1️⃣ Get QC license */
  const license = await db("admin_license_keys")
    .where({ assigned_to: userId, is_active: true })
    .first();

  if (!license?.country_code) {
    throw new Error("QC license not found");
  }

  /* 2️⃣ Map country code → full name */
  const COUNTRY_MAP = {
    QA: "Qatar",
    OM: "Oman",
    BA: "Bahrain",
  };

  const importCountry = COUNTRY_MAP[license.country_code];

  if (!importCountry) {
    throw new Error("Invalid QC country");
  }

  /* 3️⃣ Fetch container with strict access rules */
  const container = await db("farmer_plan_containers as c")
    .join("buyer_requests as br", "br.id", "c.buyer_request_id")
    .leftJoin("users as supplier", "supplier.id", "c.supplier_id")
    .select(
      "c.id",
      "c.container_no",
      "c.tracking_code",
      "c.created_at",

      "c.qc_status",
      "c.qc_note",
      "c.qc_reviewed_at",
      "c.qc_hold_reason",
      "c.qc_hold_details",
      "c.qc_arrival_info",

      "br.id as buyer_request_id",
      "br.status as buyer_request_status",
      "br.import_country",

      "supplier.name as supplier_name",
    )
    .where("c.id", containerId)
    .where("br.import_country", importCountry)
    .where("br.status", "accepted")
    .first();

  if (!container) {
    throw new Error("Container not found or access denied");
  }

  return container;
};
const getQcLicense = async (userId) => {
  const license = await db("admin_license_keys")
    .where({
      assigned_to: userId,
      is_active: true,
    })
    .first();

  if (!license) {
    throw new Error("Active QC license not found");
  }

  return license;
};
///////////////////////////////////////////////////////
const getQcScope = async (userId) => {
  const license = await db("admin_license_keys")
    .where({ assigned_to: userId, is_active: true })
    .first();

  if (!license?.country_code) {
    throw new Error("QC license or country not found");
  }

  const COUNTRY_MAP = {
    QA: "Qatar",
    OM: "Oman",
    BA: "Bahrain",
  };

  const importCountry = COUNTRY_MAP[license.country_code];

  if (!importCountry) {
    throw new Error("Invalid QC country mapping");
  }

  return { license, importCountry };
};

export const getQcContainersByStatus = async ({
  userId,
  qc_status,
  page = 1,
  limit = 20,
}) => {
  const { license, importCountry } = await getQcScope(userId);

  const baseQuery = db("farmer_plan_containers as c")
    .join("buyer_requests as br", "br.id", "c.buyer_request_id")
    .leftJoin("users as supplier", "supplier.id", "c.supplier_id")
    .where("br.import_country", importCountry)
    .where("br.status", "accepted")
    .where("c.qc_status", qc_status);

  // Count
  const [{ count }] = await baseQuery.clone().count("* as count");

  // Data
  const containers = await baseQuery
    .clone()
    .select(
      "c.id",
      "c.container_no",
      "c.qc_status",
      "c.qc_reviewed_at",
      "c.qc_hold_reason",
      "c.created_at",

      "br.id as buyer_request_id",
      "br.import_country",

      "supplier.name as supplier_name",
    )
    .orderBy("c.qc_reviewed_at", "desc")
    .limit(limit)
    .offset((page - 1) * limit);

  return {
    country: license.country_code,
    import_country: importCountry,
    qc_status,
    containers,
    pagination: {
      page,
      limit,
      total: Number(count),
      totalPages: Math.ceil(count / limit),
    },
  };
};

/* ================= MARK ARRIVED ================= */
export const markArrived = async ({
  containerId,
  arrived_at,
  arrival_place,
  userId,
}) => {
  const license = await getQcLicense(userId);

  const container = await db("farmer_plan_containers")
    .where({ id: containerId })
    .first();

  if (!container) {
    throw new Error("Container not found");
  }

  if (container.qc_status !== "pending") {
    throw new Error("Only pending containers can be marked as arrived");
  }

  await db("farmer_plan_containers").where({ id: containerId }).update({
    qc_status: "arrived",
    qc_reviewed_by: license.id, // ✅ FIXED
    qc_reviewed_at: db.fn.now(),
    qc_arrival_info: {
      arrived_at,
      arrival_place,
    },
    updated_at: db.fn.now(),
  });

  return { success: true };
};

/* ================= QC in progress ================= */
export const startQcInspection = async ({
  userId,
  containerId,
  inspectionData,
}) => {
  const license = await getQcLicense(userId);

  const container = await db("farmer_plan_containers")
    .where({ id: containerId })
    .first();

  if (!container) throw new Error("Container not found");

  if (container.qc_status !== "arrived") {
    throw new Error("QC can only start after arrival");
  }

  // 🔒 Prevent double inspection
  if (
    container.qc_inspection_info &&
    Object.keys(container.qc_inspection_info).length
  ) {
    throw new Error("QC inspection already submitted");
  }

  await db("farmer_plan_containers")
    .where({ id: containerId })
    .update({
      qc_status: "qc_submitted",
      qc_inspection_info: {
        ...inspectionData,
        inspected_at: new Date().toISOString(),
        inspected_by: license.id,
      },
      qc_reviewed_by: license.id,
      qc_reviewed_at: db.fn.now(),
      updated_at: db.fn.now(),
    });

  return { success: true };
};

/* ================= CLEAR ================= */
export const clearContainer = async ({ containerId, userId }) => {
  const license = await getQcLicense(userId);

  const container = await db("farmer_plan_containers")
    .where({ id: containerId })
    .first();

  if (!container) throw new Error("Container not found");

  if (container.qc_status !== "qc_submitted") {
    throw new Error("Container must be under QC inspection");
  }
  if (
    !container.qc_inspection_info ||
    Object.keys(container.qc_inspection_info).length === 0
  ) {
    throw new Error("QC inspection must be completed before decision");
  }
  await db("farmer_plan_containers").where({ id: containerId }).update({
    qc_status: "approved",
    qc_reviewed_by: license.id,
    qc_reviewed_at: db.fn.now(),
    updated_at: db.fn.now(),
  });

  return { success: true };
};

/* ================= HOLD ================= */
export const holdContainer = async ({
  containerId,
  reason,
  details,
  userId,
}) => {
  const license = await getQcLicense(userId);

  const container = await db("farmer_plan_containers")
    .where({ id: containerId })
    .first();

  if (!container) throw new Error("Container not found");

  if (container.qc_status !== "qc_submitted") {
    throw new Error("Container must be under QC inspection");
  }

  if (
    !container.qc_inspection_info ||
    Object.keys(container.qc_inspection_info).length === 0
  ) {
    throw new Error("QC inspection must be completed before decision");
  }

  const activeHold = await db("farmer_plan_containers")
    .where({ id: containerId, qc_status: "held" })
    .first();

  if (activeHold) {
    throw new Error("Container already has an active QC hold");
  }

  await db.transaction(async (trx) => {
    // 1️⃣ Update container state
    await trx("farmer_plan_containers")
      .where({ id: containerId })
      .update({
        qc_status: "held",
        qc_hold_reason: reason,
        qc_hold_details: details || null,
        qc_reviewed_by: license.id,
        qc_reviewed_at: trx.fn.now(),
        updated_at: trx.fn.now(),
      });
  });

  return { success: true };
};
