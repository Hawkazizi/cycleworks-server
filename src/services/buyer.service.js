import db from "../db/knex.js";
// Get offers for a buyer (all their requests with farmer offers)
export const getOffersForBuyer = async (buyerId) => {
  return db("buyer_request_offers as o")
    .join("buyer_requests as br", "o.request_id", "br.id")
    .join("users as f", "o.farmer_id", "f.id")
    .select(
      "o.id",
      "o.offer_quantity as amount",
      db.raw("NULL::numeric as price"), // ❓ you don’t have price column, keep placeholder or remove
      "o.status",
      "o.created_at",
      "br.id as buyer_request_id",
      "br.import_country",
      "f.name as farmer_name"
    )
    .where("br.buyer_id", buyerId)
    .orderBy("o.created_at", "desc");
};
export const getMinimalUsers = async () => {
  return db("users").select("id", "name", "mobile").where("status", "active");
};
