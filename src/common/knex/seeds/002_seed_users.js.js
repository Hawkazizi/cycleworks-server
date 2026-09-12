// seeds/02_users.js
// ⚠️ DEV/TEST ONLY — never run `knex seed:run` against a production database.
// IDs 10-15 mirror tests/api.test.mjs (ADMIN_ID=10, CUSTOMER_ID=11, MANAGER_ID=12,
// QC_INTERNAL_ID=13, QC_EXTERNAL_ID=14, SUPPLIER_ID=15).
import bcrypt from "bcrypt";

const PASSWORD = "Password123!";

export async function seed(knex) {
  await knex.raw("TRUNCATE TABLE users RESTART IDENTITY CASCADE");

  const hash = await bcrypt.hash(PASSWORD, 10);

  await knex("users").insert([
    {
      id: 10,
      name: "کارشناس (Admin)",
      mobile: "09120000010",
      email: "admin@example.com",
      password_hash: hash,
      status: "active",
      email_verified: true,
    },
    {
      id: 11,
      name: "مشتری (Customer)",
      mobile: "09120000011",
      email: "buyer@example.com",
      password_hash: hash,
      status: "active",
      email_verified: true,
    },
    {
      id: 12,
      name: "مدیر (Manager)",
      mobile: "09120000012",
      email: "manager@example.com",
      password_hash: hash,
      status: "active",
      email_verified: true,
    },
    {
      id: 13,
      name: "بازرس کیفیت داخلی",
      mobile: "09120000013",
      email: "qc.internal@example.com",
      password_hash: hash,
      status: "active",
      email_verified: true,
    },
    {
      id: 14,
      name: "بازرس کیفیت خارجی",
      mobile: "09120000014",
      email: "qc.external@example.com",
      password_hash: hash,
      status: "active",
      email_verified: true,
    },
    {
      id: 15,
      name: "شاهین (Supplier)",
      mobile: "09120000015",
      email: "supplier@example.com",
      password_hash: hash,
      status: "active",
      email_verified: true,
    },
    {
      id: 16,
      name: "تامین‌کننده در انتظار تایید",
      mobile: "09120000016",
      email: "supplier.pending@example.com",
      password_hash: hash,
      status: "pending",
      email_verified: true,
    },
  ]);

  await knex.raw(
    "SELECT setval(pg_get_serial_sequence('users','id'), GREATEST((SELECT MAX(id) FROM users), 1))",
  );
}
