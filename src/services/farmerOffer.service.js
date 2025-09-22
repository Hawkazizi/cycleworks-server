import knex from "../db/knex.js";

export async function listBuyerRequestsForFarmers() {
  return knex("buyer_requests")
    .where({ status: "accepted" })
    .orderBy("created_at", "desc");
}

export async function submitOffer(requestId, farmerId, offer_quantity) {
  // 1. Check buyer request exists and is accepted
  const request = await knex("buyer_requests").where({ id: requestId }).first();
  if (!request) {
    throw new Error("Buyer request not found");
  }
  if (request.status !== "accepted") {
    throw new Error("Request is not open for offers");
  }

  // 2. Check farmer has not already submitted
  const existing = await knex("buyer_request_offers")
    .where({ request_id: requestId, farmer_id: farmerId })
    .first();
  if (existing) {
    throw new Error("You have already submitted an offer for this request");
  }

  // 3. Check quantity limit
  if (Number(offer_quantity) > Number(request.quantity)) {
    throw new Error("Offer quantity exceeds buyer’s requested amount");
  }

  // 4. Insert offer
  const [offer] = await knex("buyer_request_offers")
    .insert({
      request_id: requestId,
      farmer_id: farmerId,
      offer_quantity,
      status: "pending",
    })
    .returning("*");

  return offer;
}

export async function getMyOffers(farmerId) {
  return knex("buyer_request_offers")
    .where({ farmer_id: farmerId })
    .orderBy("created_at", "desc");
}

export async function getMyOfferById(farmerId, offerId) {
  return knex("buyer_request_offers")
    .where({ id: offerId, farmer_id: farmerId })
    .first();
}

export async function updateOffer(farmerId, offerId, data) {
  const offer = await knex("buyer_request_offers")
    .where({ id: offerId, farmer_id: farmerId })
    .first();

  if (!offer) throw new Error("Offer not found");
  if (offer.status !== "pending")
    throw new Error("Only pending offers can be updated");

  const [updated] = await knex("buyer_request_offers")
    .where({ id: offerId })
    .update({
      offer_quantity: data.offer_quantity ?? offer.offer_quantity,
    })
    .returning("*");

  return updated;
}

export async function cancelOffer(farmerId, offerId) {
  const offer = await knex("buyer_request_offers")
    .where({ id: offerId, farmer_id: farmerId })
    .first();

  if (!offer) throw new Error("Offer not found");
  if (offer.status !== "pending")
    throw new Error("Only pending offers can be cancelled");

  const [updated] = await knex("buyer_request_offers")
    .where({ id: offerId })
    .update({ status: "cancelled" })
    .returning("*");

  return updated;
}
