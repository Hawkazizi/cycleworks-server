import db from "../db/knex.js";
import { Parser } from "json2csv";

export const generateReportsCSV = async (type = "all") => {
  // --- Buyer Requests ---
  const buyerRequests = await db("buyer_requests as br")
    .leftJoin("users as u", "u.id", "br.buyer_id")
    .leftJoin("admin_license_keys as a", "a.id", "br.reviewed_by")
    .select(
      "br.id",
      "u.name as buyer_name",
      "u.mobile as buyer_mobile",
      "br.status",
      "br.import_country",
      "br.entry_border",
      "br.exit_border",
      "br.container_amount",
      "br.transport_type",
      "br.product_type",
      "br.egg_type",
      "a.key as reviewed_by_key",
      "br.reviewed_at",
      "br.created_at",
      "br.updated_at",
    );

  // --- User Applications ---
  const applications = await db("user_applications as ua")
    .leftJoin("users as u", "u.id", "ua.user_id")
    .select(
      "ua.id",
      "u.name as user_name",
      "u.mobile as user_mobile",
      "ua.reason",
      "ua.status",
      "ua.reviewed_at",
      "ua.created_at",
    );

  // --- Users ---
  const users = await db("users").select(
    "id",
    "name",
    "mobile",
    "email",
    "status",
    "created_at",
  );

  // --- Completed Containers ---
  const completedContainers = await db("farmer_plan_containers as c")
    .leftJoin("users as u", "u.id", "c.supplier_id")
    .leftJoin("buyer_requests as br", "br.id", "c.buyer_request_id")
    .leftJoin("admin_license_keys as ak1", "ak1.id", "c.reviewed_by")
    .leftJoin("admin_license_keys as ak2", "ak2.id", "c.metadata_reviewed_by")
    .leftJoin(
      "admin_license_keys as ak3",
      "ak3.id",
      "c.admin_metadata_reviewed_by",
    )
    .select(
      "c.id",
      "c.plan_id",
      "c.container_no",
      "c.status",
      "c.farmer_status",
      "c.is_completed",
      "c.completed_at",
      "c.in_progress",
      "c.is_rejected",

      "c.created_at",
      "c.updated_at",
      "c.plan_date",

      "c.tracking_code",
      "c.transport_info",

      "c.metadata",
      "c.metadata_status",
      "c.metadata_review_note",
      "c.metadata_reviewed_at",

      "c.admin_metadata",
      "c.admin_metadata_status",
      "c.admin_metadata_review_note",
      "c.admin_metadata_reviewed_at",

      "u.name as supplier_name",
      "u.mobile as supplier_mobile",

      "br.import_country",
      "br.product_type",
      "br.container_amount",

      "ak1.key as reviewed_by",
      "ak2.key as metadata_reviewed_by",
      "ak3.key as admin_metadata_reviewed_by",
    )
    .where("c.is_completed", true)
    .orderBy("c.completed_at", "desc");

  // Helper for CSV conversion
  const toCSV = (data, title) => {
    if (!data.length) return `${title}\n(No Data)\n`;
    const parser = new Parser({ fields: Object.keys(data[0]) });
    return `${title}\n${parser.parse(data)}\n`;
  };

  const sections = [];

  if (type === "completed") {
    sections.push(toCSV(completedContainers, "=== Completed Containers ==="));
    return sections.join("\n\n");
  }

  sections.push(
    toCSV(buyerRequests, "=== Buyer Requests ==="),
    toCSV(applications, "=== User Applications ==="),
    toCSV(users, "=== Users ==="),
    toCSV(completedContainers, "=== Completed Containers ==="),
  );

  return sections.join("\n\n");
};
