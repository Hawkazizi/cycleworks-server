// seeds/02_users.js
export async function seed(knex) {
  // Clear users table and reset cascade
  await knex.raw("TRUNCATE TABLE users RESTART IDENTITY CASCADE");

  await knex("users").insert([
    {
      id: 1,
      name: "Admin User",
      mobile: "09120000001",
      email: "admin@example.com",
      password_hash: "hashedpassword1",
      status: "active",
    },
    {
      id: 2,
      name: "Manager User",
      mobile: "09120000002",
      email: "manager@example.com",
      password_hash: "hashedpassword2",
      status: "active",
    },
    {
      id: 3,
      name: "Regular User",
      mobile: "09120000003",
      email: "user@example.com",
      password_hash: "hashedpassword3",
      status: "pending",
    },
    {
      id: 4,
      name: "Buyer User",
      mobile: "09120000004",
      email: "buyer@example.com",
      password_hash: "hashedpassword4",
      status: "active",
    },
    {
      id: 5,
      name: "Farmer User",
      mobile: "09120000005",
      email: "farmer@example.com",
      password_hash: "hashedpassword5",
      status: "active",
    },
  ]);

  // ✅ Reset the sequence to the max(id)
  await knex.raw(`
    SELECT setval(
      pg_get_serial_sequence('users', 'id'),
      (SELECT COALESCE(MAX(id), 1) FROM users),
      true
    )
  `);
}
