import db from "../db/knex.js";
import { Parser } from "json2csv";

export const generateReportsCSV = async () => {
  // --- Buyer Requests ---
  const buyerRequests = await db("buyer_requests as br")
    .leftJoin("users as u", "u.id", "br.buyer_id")
    .leftJoin("admin_license_keys as a", "a.id", "br.reviewed_by")
    .select(
      "br.id",
      "u.name as buyer_name",
      "u.mobile as buyer_mobile",
      "br.status",
      "br.final_status",
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
      "br.updated_at"
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
      "ua.created_at"
    );

  // --- Users ---
  const users = await db("users").select(
    "id",
    "name",
    "mobile",
    "email",
    "status",
    "created_at"
  );

  // Helper for CSV conversion
  const toCSV = (data, title) => {
    if (!data.length) return `${title}\n(No Data)\n`;
    const parser = new Parser({ fields: Object.keys(data[0]) });
    return `${title}\n${parser.parse(data)}\n`;
  };

  return [
    toCSV(buyerRequests, "=== Buyer Requests ==="),
    toCSV(applications, "=== User Applications ==="),
    toCSV(users, "=== Users ==="),
  ].join("\n\n");
};
