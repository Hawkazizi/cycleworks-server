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
    creator_id: buyer.id,
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
    container_amount: 3,
    expiration_days: 30,
    transport_type: "truck",
    cartons: 1200,
    description: "Organic small eggs shipment to Qatar",
    admin_extra_files: JSON.stringify([]),
    deadline_start: "2025-10-20",
    deadline_end: "2025-10-30",
    created_at: now,
    updated_at: now,
  };

  const r2 = {
    buyer_id: buyer.id,
    creator_id: buyer.id,
    status: "completed",
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
    container_amount: 6,
    expiration_days: 45,
    transport_type: "ship",
    cartons: 2500,
    description: "Standard egg shipment to Oman",
    admin_extra_files: JSON.stringify([]),
    deadline_start: "2025-11-20",
    deadline_end: "2025-12-10",
    created_at: now,
    updated_at: now,
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
