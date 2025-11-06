import knex from "../db/knex.js";
import bcrypt from "bcrypt";

/* =======================================================================
   👤 USER PROFILE MANAGEMENT
======================================================================= */

/**
 * Fetch a user record by ID.
 * @param {number} id - User ID.
 * @returns {Promise<object|null>} The user record or null if not found.
 */
export async function getById(id) {
  return knex("users").where({ id }).first();
}

/**
 * Update buyer/user profile fields.
 * Only name, email, and mobile are editable.
 * @param {number} userId - The ID of the user to update.
 * @param {object} data - The profile fields to update.
 * @returns {Promise<object>} Updated user record.
 */
export async function updateProfile(userId, data) {
  const updates = {};

  if (data.name) updates.name = data.name.trim();
  if (data.email) {
    const email = data.email.trim();
    const exists = await knex("users")
      .whereRaw("LOWER(email) = ?", [email.toLowerCase()])
      .andWhereNot("id", userId)
      .first();
    if (exists) throw new Error("Email already in use");
    updates.email = email;
  }
  if (data.mobile) updates.mobile = data.mobile.trim();

  if (Object.keys(updates).length === 0) {
    throw new Error("No valid fields to update");
  }

  // Optional: validate email format
  if (
    updates.email &&
    !/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(updates.email)
  ) {
    throw new Error("Invalid email format");
  }

  if (updates.mobile && !/^(\+98|0)?9\d{9}$/.test(updates.mobile)) {
    throw new Error("Invalid mobile number format");
  }

  updates.updated_at = knex.fn.now();

  const [updated] = await knex("users")
    .where({ id: userId })
    .update(updates)
    .returning([
      "id",
      "name",
      "email",
      "mobile",
      "status",
      "email_verified",
      "profile_picture",
      "updated_at",
    ]);

  if (!updated) throw new Error("Profile not found or update failed");

  return updated;
}

/* =======================================================================
   👥 USER ROLE UTILITIES
======================================================================= */

/**
 * Retrieve all active users with the "user" role.
 * Commonly used for assigning buyer requests or supplier operations.
 * @returns {Promise<object[]>} List of active users with role = "user".
 */
export async function getUsersWithUserRole() {
  return knex("users as u")
    .join("user_roles as ur", "u.id", "ur.user_id")
    .join("roles as r", "ur.role_id", "r.id")
    .whereRaw("LOWER(r.name) = 'user'")
    .andWhere("u.status", "active")
    .select(
      "u.id",
      "u.name",
      "u.email",
      "u.mobile",
      "u.status",
      "u.created_at",
      "r.name as role",
    )
    .orderBy("u.created_at", "desc");
}
