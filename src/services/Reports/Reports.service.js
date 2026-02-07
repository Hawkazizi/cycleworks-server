import db from "../../db/knex.js";

/* =========================================================
   GET FULL QC REPORT (INTERNAL + EXTERNAL) FOR CONTAINER
========================================================= */

export const getContainerQcReport = async (containerId) => {
  /* ================= CONTAINER + INTERNAL QC ================= */

  const container = await db("farmer_plan_containers as c")
    .join("buyer_requests as br", "br.id", "c.buyer_request_id")
    .leftJoin("users as supplier", "supplier.id", "c.supplier_id")
    .leftJoin(
      "admin_license_keys as qc_license",
      "qc_license.id",
      "c.qc_reviewed_by",
    )
    .select(
      "c.id",
      "c.container_no",
      "c.tracking_code",
      "c.created_at",

      "c.qc_status",
      "c.qc_reviewed_at",
      "c.qc_note",
      "c.qc_hold_reason",
      "c.qc_hold_details",
      "c.qc_arrival_info",
      "c.qc_inspection_info",

      "supplier.name as supplier_name",
      "br.import_country",

      "qc_license.country_code as internal_qc_country",
    )
    .where("c.id", containerId)
    .first();

  if (!container) {
    throw new Error("Container not found");
  }

  /* ================= EXTERNAL QC REPORT ================= */

  const externalQc = await db("external_qc_reports as r")
    .leftJoin(
      "admin_license_keys as ext_license",
      "ext_license.id",
      "r.qc_license_id",
    )
    .select(
      "r.id",
      "r.actual_quantity",
      "r.quality_condition",
      "r.packaging_condition",
      "r.discrepancies",
      "r.attachments",
      "r.confirmed_at",

      "ext_license.country_code as external_qc_country",
    )
    .where("r.container_id", containerId)
    .first();

  /* ================= FINAL RESPONSE ================= */

  return {
    container: {
      id: container.id,
      container_no: container.container_no,
      tracking_code: container.tracking_code,
      supplier_name: container.supplier_name,
      import_country: container.import_country,
      created_at: container.created_at,
    },

    internal_qc: {
      qc_status: container.qc_status,
      reviewed_at: container.qc_reviewed_at,
      qc_country: container.internal_qc_country,
      arrival_info: container.qc_arrival_info,
      inspection_info: container.qc_inspection_info,
      hold_reason: container.qc_hold_reason,
      hold_details: container.qc_hold_details,
      note: container.qc_note,
    },

    external_qc: externalQc
      ? {
          report_id: externalQc.id,
          actual_quantity: externalQc.actual_quantity,
          quality_condition: externalQc.quality_condition,
          packaging_condition: externalQc.packaging_condition,
          discrepancies: externalQc.discrepancies,
          attachments: externalQc.attachments,
          confirmed_at: externalQc.confirmed_at,
          qc_country: externalQc.external_qc_country,
        }
      : null,
  };
};
