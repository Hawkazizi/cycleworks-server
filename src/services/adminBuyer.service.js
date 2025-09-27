import knex from "../db/knex.js";

export async function getBuyerRequests() {
  return knex("buyer_requests").orderBy("created_at", "desc");
}
export async function getBuyerRequestById(id) {
  return knex("buyer_requests")
    .join("users", "buyer_requests.buyer_id", "users.id")
    .select(
      "buyer_requests.*",
      "users.name as buyer_name",
      "users.email as buyer_email",
      "users.mobile as buyer_mobile"
    )
    .where("buyer_requests.id", id)
    .first();
}

export async function reviewBuyerRequest(id, { status, reviewerId }) {
  const [updated] = await knex("buyer_requests")
    .where({ id })
    .update({
      status,
      reviewed_by: reviewerId,
      reviewed_at: knex.fn.now(),
    })
    .returning("*");

  if (updated && status === "accepted") {
    const now = new Date();

    // 🔎 Find an approved packing unit for the preferred supplier (farmer)
    const packingUnit = await knex("packing_units")
      .where({ user_id: updated.preferred_supplier_id, status: "Approved" })
      .first();

    if (!packingUnit) {
      throw new Error("No approved packing unit found for this supplier");
    }

    // ✅ Insert export permit request with real packing_unit_id
    await knex("export_permit_requests").insert({
      packing_unit_id: packingUnit.id,
      destination_country: updated.import_country,
      max_tonnage: updated.quantity,
      buyer_request_id: updated.id,
      status: "Requested", // not active yet, admin must review permit separately
      created_at: now,
      updated_at: now,
    });
  }

  return updated;
}
export async function getAllOffers() {
  return knex("buyer_request_offers as bro")
    .join("buyer_requests as br", "bro.request_id", "br.id")
    .join("users as u", "bro.farmer_id", "u.id")
    .leftJoin("user_roles as ur", "u.id", "ur.user_id")
    .leftJoin("roles as r", "ur.role_id", "r.id")
    .select(
      "bro.id",
      "bro.request_id",
      "bro.offer_quantity",
      "bro.status as offer_status",
      "bro.created_at as offer_created_at",
      "u.id as farmer_id",
      "u.name as farmer_name",
      "u.mobile as farmer_mobile",
      "u.email as farmer_email",
      // use product_type instead of product
      knex.raw("array_to_string(br.product_type, ',') as product_types"),
      "br.quantity as requested_quantity",
      "br.import_country",
      "br.entry_border",
      "br.exit_border",
      knex.raw("string_agg(r.name, ',') as roles")
    )
    .groupBy("bro.id", "u.id", "br.id")
    .orderBy("bro.created_at", "desc");
}

// services/adminBuyer.service.js
export async function getOffersForRequest(offerId) {
  return knex("buyer_request_offers as bro")
    .join("buyer_requests as br", "bro.request_id", "br.id")
    .join("users as f", "bro.farmer_id", "f.id") // farmer info
    .join("users as b", "br.buyer_id", "b.id") // buyer info
    .leftJoin("user_roles as ur", "f.id", "ur.user_id")
    .leftJoin("roles as r", "ur.role_id", "r.id")
    .select(
      "bro.id",
      "bro.request_id",
      "bro.offer_quantity",
      "bro.status as offer_status",
      "bro.created_at as offer_created_at",

      // farmer
      "f.id as farmer_id",
      "f.name as farmer_name",
      "f.mobile as farmer_mobile",
      "f.email as farmer_email",

      // buyer
      "b.id as buyer_id",
      "b.name as buyer_name",
      "b.mobile as buyer_mobile",
      "b.email as buyer_email",
      "b.status as buyer_status",

      // request info
      knex.raw("array_to_string(br.product_type, ',') as product_types"),
      "br.quantity as requested_quantity",
      "br.import_country",
      "br.entry_border",
      "br.exit_border",

      // roles of farmer
      knex.raw("string_agg(r.name, ',') as roles")
    )
    .where("bro.id", offerId) // filter by OFFER ID
    .groupBy("bro.id", "f.id", "b.id", "br.id")
    .orderBy("bro.created_at", "desc");
}

export async function reviewOffer(offerId, { status }) {
  const [updated] = await knex("buyer_request_offers")
    .where({ id: offerId })
    .update({ status })
    .returning("*");
  return updated;
}
