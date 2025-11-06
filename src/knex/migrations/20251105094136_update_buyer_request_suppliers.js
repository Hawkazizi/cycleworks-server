export async function up(knex) {
  // 1️⃣ Drop any old UNIQUE constraints safely (ignore missing ones)
  await knex.raw(`
    ALTER TABLE buyer_request_suppliers
    DROP CONSTRAINT IF EXISTS buyer_request_suppliers_buyer_request_id_supplier_id_unique,
    DROP CONSTRAINT IF EXISTS buyer_request_suppliers_buyer_request_id_supplier_id_container_id_unique,
    DROP CONSTRAINT IF EXISTS buyer_request_suppliers_buyer_request_id_supplier_id_container_unique,
    DROP CONSTRAINT IF EXISTS buyer_request_suppliers_unique_combination,
    DROP CONSTRAINT IF EXISTS buyer_request_suppliers_unique_pair;
  `);

  // 2️⃣ DO NOT re-add FKs (they already exist).
  // Just make sure the column definitions are compatible.
  await knex.schema.alterTable("buyer_request_suppliers", (table) => {
    // Confirm columns exist with correct types
    table.decimal("share_percentage").defaultTo(0).alter();
  });

  // 3️⃣ Add clean, named UNIQUE constraints
  await knex.raw(`
    ALTER TABLE buyer_request_suppliers
    ADD CONSTRAINT buyer_request_suppliers_unique_container_per_request
      UNIQUE (buyer_request_id, container_id),
    ADD CONSTRAINT buyer_request_suppliers_unique_triple
      UNIQUE (buyer_request_id, supplier_id, container_id);
  `);
}

export async function down(knex) {
  await knex.raw(`
    ALTER TABLE buyer_request_suppliers
    DROP CONSTRAINT IF EXISTS buyer_request_suppliers_unique_container_per_request,
    DROP CONSTRAINT IF EXISTS buyer_request_suppliers_unique_triple;
  `);
}
