// services/buyerRequest.service.js
import knex from "../db/knex.js";

export async function createRequest(userId, data) {
  const [req] = await knex("buyer_requests")
    .insert({
      buyer_id: userId,
      product_type: data.product_type || "eggs",
      packaging: data.packaging || null,
      size: Array.isArray(data.size) ? data.size : [],
      egg_type: data.egg_type || null,
      expiration_days: data.expiration_days || null,
      certificates: Array.isArray(data.certificates) ? data.certificates : [],
      container_amount: data.container_amount || null,
      deadline_date: data.deadline_date || null,
      transport_type: data.transport_type || null,
      import_country: data.import_country || null,
      entry_border: data.entry_border || null,
      exit_border: data.exit_border || null,
      preferred_supplier_name: data.preferred_supplier_name || null,
      preferred_supplier_id: data.preferred_supplier_id || null,
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
      packaging: data.packaging ?? req.packaging,
      size: data.size ?? req.size,
      egg_type: data.egg_type ?? req.egg_type,
      expiration_days: data.expiration_days ?? req.expiration_days,
      certificates: data.certificates ?? req.certificates,
      container_amount: data.container_amount ?? req.container_amount,
      deadline_date: data.deadline_date ?? req.deadline_date,
      transport_type: data.transport_type ?? req.transport_type,
      import_country: data.import_country ?? req.import_country,
      entry_border: data.entry_border ?? req.entry_border,
      exit_border: data.exit_border ?? req.exit_border,
      preferred_supplier_name:
        data.preferred_supplier_name ?? req.preferred_supplier_name,
      preferred_supplier_id:
        data.preferred_supplier_id ?? req.preferred_supplier_id,
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
