import db from "../../db/knex.js";

/* ================= HELPERS ================= */

const getExternalQcScope = async (userId) => {
  const license = await db("admin_license_keys")
    .where({
      assigned_to: userId,
      is_active: true,
    })
    .first();

  if (!license?.country_code) {
    throw new Error("External QC license or country not found");
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

/* ================= GET APPROVED CONTAINERS ================= */

export const getApprovedContainersForExternalQc = async ({
  userId,
  page = 1,
  limit = 20,
}) => {
  const { license, importCountry } = await getExternalQcScope(userId);

  const baseQuery = db("farmer_plan_containers as c")
    .join("buyer_requests as br", "br.id", "c.buyer_request_id")
    .leftJoin("users as supplier", "supplier.id", "c.supplier_id")
    .leftJoin("external_qc_reports as r", "r.container_id", "c.id")
    .where("c.qc_status", "approved")
    .where("br.import_country", importCountry)
    .where("br.status", "accepted")
    .whereNull("r.id"); // 🚫 hide already reported containers

  const [{ count }] = await baseQuery.clone().count("* as count");

  const containers = await baseQuery
    .clone()
    .select(
      "c.id",
      "c.container_no",
      "c.tracking_code",
      "c.created_at",
      "c.qc_reviewed_at",

      "supplier.name as supplier_name",
      "br.import_country",
    )
    .orderBy("c.qc_reviewed_at", "desc")
    .limit(limit)
    .offset((page - 1) * limit);

  return {
    country: license.country_code,
    import_country: importCountry,
    containers,
    pagination: {
      page,
      limit,
      total: Number(count),
      totalPages: Math.ceil(count / limit),
    },
  };
};

/* ================= SUBMIT EXTERNAL QC REPORT ================= */

export const submitExternalQcReport = async ({
  userId,
  containerId,
  actual_quantity,
  quality_condition,
  packaging_condition,
  discrepancies,
}) => {
  const { license, importCountry } = await getExternalQcScope(userId);

  const container = await db("farmer_plan_containers as c")
    .join("buyer_requests as br", "br.id", "c.buyer_request_id")
    .select("c.id", "c.qc_status", "br.import_country")
    .where("c.id", containerId)
    .first();

  if (!container) {
    throw new Error("Container not found");
  }

  if (container.qc_status !== "approved") {
    throw new Error("Only approved containers can be reported");
  }

  if (container.import_country !== importCountry) {
    throw new Error("Access denied for this container");
  }

  const exists = await db("external_qc_reports")
    .where({ container_id: containerId })
    .first();

  if (exists) {
    throw new Error("External QC report already submitted");
  }

  await db("external_qc_reports").insert({
    container_id: containerId,
    qc_license_id: license.id,
    actual_quantity,
    quality_condition: quality_condition || null,
    packaging_condition: packaging_condition || null,
    discrepancies: discrepancies || null,
    confirmed_at: db.fn.now(),
    created_at: db.fn.now(),
    updated_at: db.fn.now(),
  });

  return { success: true };
};

/* ================= REPORTED CONTAINERS HISTORY ================= */

export const getExternalQcReportedContainers = async ({
  userId,
  page = 1,
  limit = 20,
}) => {
  const { license, importCountry } = await getExternalQcScope(userId);

  const baseQuery = db("external_qc_reports as r")
    .join("farmer_plan_containers as c", "c.id", "r.container_id")
    .join("buyer_requests as br", "br.id", "c.buyer_request_id")
    .leftJoin("users as supplier", "supplier.id", "c.supplier_id")
    .where("r.qc_license_id", license.id)
    .where("br.import_country", importCountry);

  const [{ count }] = await baseQuery.clone().count("* as count");

  const reports = await baseQuery
    .clone()
    .select(
      "r.id as report_id",
      "r.confirmed_at",
      "r.actual_quantity",
      "r.quality_condition",
      "r.packaging_condition",
      "r.discrepancies",

      "c.id as container_id",
      "c.container_no",
      "c.tracking_code",

      "supplier.name as supplier_name",
      "br.import_country",
    )
    .orderBy("r.confirmed_at", "desc")
    .limit(limit)
    .offset((page - 1) * limit);

  return {
    country: license.country_code,
    import_country: importCountry,
    reports,
    pagination: {
      page,
      limit,
      total: Number(count),
      totalPages: Math.ceil(count / limit),
    },
  };
};
