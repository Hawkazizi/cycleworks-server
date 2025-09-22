// services/buyerRequest.service.js
import knex from "../db/knex.js";

export async function createRequest(userId, data) {
  const [req] = await knex("buyer_requests")
    .insert({
      buyer_id: userId, // now references users.id
      product: data.product || "eggs",
      quantity: data.quantity,
      destination_country: data.destination_country,
      status: "pending",
    })
    .returning("*");
  return req;
}

export async function getMyRequests(userId) {
  return knex("buyer_requests")
    .where({ buyer_id: userId })
    .orderBy("created_at", "desc");
}

export async function getRequestById(userId, id) {
  return knex("buyer_requests").where({ id, buyer_id: userId }).first();
}

export async function updateRequest(userId, requestId, data) {
  const req = await knex("buyer_requests")
    .where({ id: requestId, buyer_id: userId })
    .first();
  if (!req) throw new Error("Request not found");
  if (req.status !== "pending")
    throw new Error("Only pending requests can be updated");

  const [updated] = await knex("buyer_requests")
    .where({ id: requestId })
    .update({
      quantity: data.quantity ?? req.quantity,
      destination_country: data.destination_country ?? req.destination_country,
      updated_at: knex.fn.now(),
    })
    .returning("*");

  return updated;
}

export async function cancelRequest(userId, requestId) {
  const req = await knex("buyer_requests")
    .where({ id: requestId, buyer_id: userId })
    .first();
  if (!req) throw new Error("Request not found");
  if (req.status !== "pending")
    throw new Error("Only pending requests can be cancelled");

  const [updated] = await knex("buyer_requests")
    .where({ id: requestId })
    .update({
      status: "cancelled",
      updated_at: knex.fn.now(),
    })
    .returning("*");

  return updated;
}

export async function getMyRequestHistory(userId) {
  return knex("buyer_requests")
    .where({ buyer_id: userId })
    .orderBy("created_at", "desc");
}
