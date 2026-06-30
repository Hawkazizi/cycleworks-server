// seeds/02_users.js
import bcrypt from "bcrypt";

export async function seed(knex) {
  await knex.raw("TRUNCATE TABLE users RESTART IDENTITY CASCADE");

  const hash = await bcrypt.hash("Password123!", 10);

  await knex("users").insert([
    {
      id: 1,
      name: "Admin User",
      mobile: "09120000001",
      email: "admin@example.com",
      password_hash: hash,
      status: "active",
    },
    {
      id: 2,
      name: "Manager User",
      mobile: "09120000002",
      email: "manager@example.com",
      password_hash: hash,
      status: "active",
    },
    {
      id: 3,
      name: "Regular User",
      mobile: "09120000003",
      email: "user@example.com",
      password_hash: hash,
      status: "pending",
    },
    {
      id: 4,
      name: "Buyer User",
      mobile: "09120000004",
      email: "buyer@example.com",
      password_hash: hash,
      status: "active",
    },
    {
      id: 5,
      name: "Farmer User",
      mobile: "09120000005",
      email: "farmer@example.com",
      password_hash: hash,
      status: "active",
    },
  ]);

  await knex.raw(`
    SELECT setval(
      pg_get_serial_sequence('users', 'id'),
      (SELECT COALESCE(MAX(id), 1) FROM users),
      true
    )
  `);
}
