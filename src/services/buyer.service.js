import knex from "../db/knex.js";
import bcrypt from "bcrypt";

/**
 * Get user by id
 */
export async function getById(id) {
  return knex("users").where({ id }).first();
}

/**
 * Update buyer profile (name, email, mobile)
 */
export async function updateProfile(userId, data) {
  const updates = {};

  if (data.name) updates.name = data.name;
  if (data.email) updates.email = data.email;
  if (data.mobile) updates.mobile = data.mobile;

  if (Object.keys(updates).length === 0) {
    throw new Error("No valid fields to update");
  }

  updates.updated_at = knex.fn.now();

  const [updated] = await knex("users")
    .where({ id: userId })
    .update(updates)
    .returning(["id", "name", "email", "mobile", "status", "updated_at"]);

  return updated;
}
