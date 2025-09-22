import knex from "../db/knex.js";

export async function getBuyerRequests() {
  return knex("buyer_requests").orderBy("created_at", "desc");
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
  return updated;
}

export async function getOffersForRequest(requestId) {
  return knex("buyer_request_offers").where({ request_id: requestId });
}

export async function reviewOffer(offerId, { status }) {
  const [updated] = await knex("buyer_request_offers")
    .where({ id: offerId })
    .update({ status })
    .returning("*");
  return updated;
}
