import * as buyerReqService from "../services/buyerRequest.service.js";
import * as buyerService from "../services/buyer.service.js";
import knex from "../db/knex.js";

export async function getProfile(req, res) {
  const me = await knex("users").where({ id: req.user.id }).first();
  res.json(me);
}

export async function createRequest(req, res) {
  try {
    const request = await buyerReqService.createRequest(req.user.id, req.body);
    res.json(request);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
}

export async function getMyRequests(req, res) {
  const list = await buyerReqService.getMyRequests(req.user.id);
  res.json(list);
}

export async function getRequestById(req, res) {
  const item = await buyerReqService.getRequestById(req.user.id, req.params.id);
  if (!item) return res.status(404).json({ error: "Not found" });
  res.json(item);
}

export async function updateRequest(req, res) {
  try {
    const updated = await buyerReqService.updateRequest(
      req.user.id,
      req.params.id,
      req.body
    );
    res.json(updated);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
}

export async function cancelRequest(req, res) {
  try {
    const cancelled = await buyerReqService.cancelRequest(
      req.user.id,
      req.params.id
    );
    res.json(cancelled);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
}

export async function getMyRequestHistory(req, res) {
  const list = await buyerReqService.getMyRequestHistory(req.user.id);
  res.json(list);
}

// Get offers
export const getOffersForBuyer = async (req, res) => {
  try {
    const offers = await buyerService.getOffersForBuyer(req.user.id);
    res.json({ offers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
