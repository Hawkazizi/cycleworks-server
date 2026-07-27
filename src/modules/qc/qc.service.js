import db from "../../common/db/knex.js";
import { NotificationService } from "../notification/notification.service.js";

// ✅ Helper to notify all active Admins and Managers
const notifyAdmins = async (type, containerId, data = {}) => {
  try {
    const adminIds = await db("users as u")
      .join("user_roles as ur", "u.id", "ur.user_id")
      .join("roles as r", "r.id", "ur.role_id")
      .whereRaw("LOWER(r.name) IN ('admin', 'manager')")
      .where("u.status", "active")
      .distinct()
      .pluck("u.id");

    for (const adminId of adminIds) {
      await NotificationService.create(adminId, type, containerId, data);
    }
  } catch (err) {
    console.error(`Failed to send ${type} notification:`, err);
  }
};

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

export const getQcContainers = async ({
  userId,
  page = 1,
  limit = 20,
  qc_status,
  search,
  supplier_name,
  sort_by = "created_at",
  sort_direction = "desc",
  start_date,
  end_date,
}) => {
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
    KW: "Kuwait",
  };

  const importCountry = COUNTRY_MAP[license.country_code];

  if (!importCountry) {
    throw new Error("Invalid QC country mapping");
  }

  const baseQuery = db("farmer_plan_containers as c")
    .join("buyer_requests as br", "br.id", "c.buyer_request_id")
    .leftJoin("users as supplier", "supplier.id", "c.supplier_id")
    .where("br.import_country", importCountry)
    .where("br.status", "accepted");

  const statsQuery = baseQuery.clone();

  if (qc_status) {
    baseQuery.andWhere("c.qc_status", qc_status);
  }

  if (search) {
    const cleanSearch = search.replace(/^#/, "").trim();

    baseQuery.andWhere(function () {
      this.orWhereRaw("CAST(c.container_no AS TEXT) ILIKE ?", [
        `%${cleanSearch}%`,
      ]).orWhereRaw("CAST(c.tracking_code AS TEXT) ILIKE ?", [
        `%${cleanSearch}%`,
      ]);

      if (!isNaN(cleanSearch) && cleanSearch !== "") {
        this.orWhere("c.id", "=", parseInt(cleanSearch, 10));
      }
    });

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

  const [{ count }] = await baseQuery.clone().count("* as count");

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
  const license = await db("admin_license_keys")
    .where({ assigned_to: userId, is_active: true })
    .first();

  if (!license?.country_code) throw new Error("QC license not found");

  const COUNTRY_MAP = { QA: "Qatar", OM: "Oman", BA: "Bahrain", KW: "Kuwait" };
  const importCountry = COUNTRY_MAP[license.country_code];
  if (!importCountry) throw new Error("Invalid QC country");

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
      "c.qc_inspection_info",
      "c.metadata",
      "c.admin_metadata",
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

  const files = await db("farmer_plan_files")
    .where({ container_id: containerId })
    .select(
      "id",
      "original_name",
      "path",
      "type",
      "status",
      "review_note",
      "created_at",
    )
    .orderBy("created_at", "desc");

  const parseJson = (val) => {
    if (!val) return {};
    return typeof val === "string" ? JSON.parse(val) : val;
  };

  return {
    ...container,
    files,
    metadata: parseJson(container.metadata),
    admin_metadata: parseJson(container.admin_metadata),
    qc_inspection_info: parseJson(container.qc_inspection_info),
  };
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
    KW: "Kuwait",
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

  const [{ count }] = await baseQuery.clone().count("* as count");

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
    qc_reviewed_by: license.id,
    qc_reviewed_at: db.fn.now(),
    qc_arrival_info: {
      arrived_at,
      arrival_place,
    },
    is_completed: true,
    in_progress: false,
    completed_at: arrived_at,
    updated_at: db.fn.now(),
  });

  // ✅ Notify Admins/Managers
  await notifyAdmins("qc_internal_arrived", containerId, {
    container_no: container.container_no,
  });

  return { success: true };
};

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

  // ✅ Notify Admins/Managers
  await notifyAdmins("qc_internal_inspection_submitted", containerId, {
    container_no: container.container_no,
  });

  return { success: true };
};

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

  // ✅ Notify Admins/Managers
  await notifyAdmins("qc_internal_cleared", containerId, {
    container_no: container.container_no,
  });

  return { success: true };
};

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

  // ✅ Notify Admins/Managers
  await notifyAdmins("qc_internal_hold", containerId, {
    container_no: container.container_no,
    reason: reason,
  });

  return { success: true };
};
export const updateAdminMetadata = async ({
  userId,
  containerId,
  bl_no,
  bl_date,
}) => {
  // Keep this to ensure the user has a valid active QC license
  const license = await getQcLicense(userId);

  const container = await db("farmer_plan_containers")
    .where({ id: containerId })
    .first();
  if (!container) throw new Error("Container not found");

  const currentAdminMeta =
    typeof container.admin_metadata === "string"
      ? JSON.parse(container.admin_metadata)
      : container.admin_metadata || {};

  const updatedAdminMeta = {
    ...currentAdminMeta,
    bl_no: bl_no !== undefined ? bl_no : currentAdminMeta.bl_no,
    bl_date: bl_date !== undefined ? bl_date : currentAdminMeta.bl_date,
    updated_at: new Date().toISOString(),
  };

  await db("farmer_plan_containers").where({ id: containerId }).update({
    admin_metadata: updatedAdminMeta,
    admin_metadata_reviewed_by: userId, // ✅ FIXED: Use userId, NOT license.id
    admin_metadata_reviewed_at: db.fn.now(),
    updated_at: db.fn.now(),
  });

  await notifyAdmins("qc_admin_metadata_updated", containerId, {
    container_no: container.container_no,
  });

  return { success: true, admin_metadata: updatedAdminMeta };
};

export const unholdContainer = async ({ containerId, userId }) => {
  const license = await getQcLicense(userId);

  const container = await db("farmer_plan_containers")
    .where({ id: containerId })
    .first();

  if (!container) throw new Error("Container not found");

  if (container.qc_status !== "held") {
    throw new Error("Container is not currently on hold");
  }

  await db("farmer_plan_containers").where({ id: containerId }).update({
    qc_status: "qc_submitted",
    qc_hold_reason: null,
    qc_hold_details: null,
    qc_reviewed_by: license.id,
    qc_reviewed_at: db.fn.now(),
    updated_at: db.fn.now(),
  });

  // ✅ Notify Admins/Managers
  await notifyAdmins("qc_internal_hold_released", containerId, {
    container_no: container.container_no,
  });

  return { success: true };
};
export const updateArrivalInfo = async ({
  containerId,
  arrived_at,
  arrival_place,
  userId,
}) => {
  const license = await getQcLicense(userId);
  const container = await db("farmer_plan_containers")
    .where({ id: containerId })
    .first();

  if (!container) throw new Error("Container not found");
  if (container.qc_status === "pending") {
    throw new Error(
      "Container has not arrived yet. Use the arrival endpoint instead.",
    );
  }

  await db("farmer_plan_containers").where({ id: containerId }).update({
    qc_arrival_info: { arrived_at, arrival_place },
    qc_reviewed_by: license.id,
    qc_reviewed_at: db.fn.now(),
    updated_at: db.fn.now(),
  });

  await notifyAdmins("qc_internal_arrival_updated", containerId, {
    container_no: container.container_no,
  });

  return { success: true };
};
