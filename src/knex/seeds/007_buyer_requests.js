// seeds/07_buyer_requests.js
export async function seed(knex) {
  await knex.raw("TRUNCATE TABLE buyer_requests RESTART IDENTITY CASCADE");

  const buyer = await knex("users")
    .where({ email: "buyer@example.com" })
    .first();
  const farmer = await knex("users")
    .where({ email: "farmer@example.com" })
    .first();
  const adminKey = await knex("admin_license_keys")
    .where({ key: "ADMIN-KEY-123" })
    .first();
  const now = knex.fn.now();

  const r1 = {
    buyer_id: buyer.id,
    status: "accepted",
    reviewed_by: adminKey.id,
    reviewed_at: now,
    product_type: "eggs",
    packaging: "tray",
    size: ["small"],
    egg_type: "organic",
    expiration_date: "2025-10-31",
    certificates: ["ISO22000"],
    import_country: "Qatar",
    entry_border: "Bushehr Port",
    exit_border: "Doha",
    preferred_supplier_name: "Farmer User",
    preferred_supplier_id: farmer.id,
    farmer_status: "accepted",
    farmer_plan: JSON.stringify({
      weekly_supply: "1500 eggs/week",
      delivery_start: "2025-10-05",
      delivery_end: "2025-11-30",
      notes: "Health certificate to be included",
    }),
    farmer_docs: JSON.stringify([
      {
        filename: "health-cert.pdf",
        path: "/uploads/demo/health-cert.pdf",
        mimetype: "application/pdf",
      },
    ]),
    final_status: "pending",
    container_amount: 3,
    transport_type: "truck",
    expiration_days: 30,
    deadline_date: "2025-11-30",
  };

  const r2 = {
    buyer_id: buyer.id,
    status: "accepted",
    reviewed_by: adminKey.id,
    reviewed_at: now,
    product_type: "eggs",
    packaging: "carton",
    size: ["mixed"],
    egg_type: "standard",
    expiration_date: "2025-12-15",
    certificates: ["ISO9001", "HALAL"],
    import_country: "Oman",
    entry_border: "Bandar Abbas",
    exit_border: "Sohar",
    preferred_supplier_name: "Farmer User",
    preferred_supplier_id: farmer.id,
    farmer_status: "accepted",
    farmer_plan: JSON.stringify({
      weekly_supply: "3000 eggs/week",
      delivery_start: "2025-10-10",
      delivery_end: "2025-12-10",
      notes: "All pallets shrink-wrapped",
    }),
    farmer_docs: JSON.stringify([
      {
        filename: "farm-registration.jpg",
        path: "/uploads/demo/farm-registration.jpg",
        mimetype: "image/jpeg",
      },
    ]),
    admin_docs: JSON.stringify([
      {
        filename: "final-checklist.pdf",
        path: "/uploads/demo/final-checklist.pdf",
        mimetype: "application/pdf",
      },
    ]),
    final_status: "completed",
    container_amount: 6,
    transport_type: "ship",
    expiration_days: 45,
    deadline_date: "2025-12-10",
  };

  await knex("buyer_requests").insert([r1, r2]);

  await knex.raw(`
    SELECT setval(
      pg_get_serial_sequence('buyer_requests', 'id'),
      (SELECT COALESCE(MAX(id), 1) FROM buyer_requests),
      true
    )
  `);
}
