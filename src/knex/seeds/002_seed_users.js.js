export async function seed(knex) {
  // clear children first
  // await knex("packing_units").del();
  // await knex("user_roles").del();
  // await knex("user_applications").del();
  // await knex("admin_license_keys").del();

  //Or do this instead :
  await knex.raw("TRUNCATE TABLE users RESTART IDENTITY CASCADE");
  // then users
  await knex("users").del();

  await knex("users").insert([
    {
      id: 1,
      name: "Admin User",
      mobile: "09120000001", // new required field
      email: "admin@example.com", // optional
      password_hash: "hashedpassword1", // bcrypt hash in real usage
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
  ]);
}
