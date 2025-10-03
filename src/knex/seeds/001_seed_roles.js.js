// src/knex/seeds/001_seed_roles.js

export async function seed(knex) {
  // Instead of deleting, insert-or-ignore (idempotent)
  const roles = [
    { id: 1, name: "admin" },
    { id: 2, name: "manager" },
    { id: 3, name: "user" },
    { id: 4, name: "buyer" },
  ];

  for (const role of roles) {
    await knex("roles")
      .insert(role)
      .onConflict("id") // if ID already exists
      .ignore(); // skip instead of error
  }
}
