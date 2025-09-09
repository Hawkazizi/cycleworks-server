export async function seed(knex) {
  await knex("users").del();

  await knex("users").insert([
    {
      id: 1,
      name: "Admin User",
      email: "admin@example.com",
      password_hash: "hashedpassword1", // replace with bcrypt hash in real usage
      status: "active",
    },
    {
      id: 2,
      name: "Manager User",
      email: "manager@example.com",
      password_hash: "hashedpassword2",
      status: "active",
    },
    {
      id: 3,
      name: "Regular User",
      email: "user@example.com",
      password_hash: "hashedpassword3",
      status: "pending",
    },
  ]);
}
