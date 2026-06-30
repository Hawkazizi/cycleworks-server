// migrations/20250923_add_buyer_request_fields.js

export async function up(knex) {
  await knex.schema.alterTable("buyer_requests", (t) => {
    // Section 1: Product details
    t.specificType("product_type", "text[]").defaultTo("{}");
    t.specificType("packaging", "text[]").defaultTo("{}");
    t.specificType("size", "text[]").defaultTo("{}");
    t.specificType("egg_type", "text[]").defaultTo("{}");
    t.date("expiration_date").nullable();
    t.specificType("certificates", "text[]").defaultTo("{}");
    // ⚠️ do NOT re-add "quantity" (already exists)

    // Section 2: Logistics
    t.string("import_country", 100).nullable();
    t.string("entry_border", 100).nullable();
    t.string("exit_border", 100).nullable();

    // Section 3: Supplier preference
    t.string("preferred_supplier", 150).nullable();
  });
}

export async function down(knex) {
  await knex.schema.alterTable("buyer_requests", (t) => {
    t.dropColumn("product_type");
    t.dropColumn("packaging");
    t.dropColumn("size");
    t.dropColumn("egg_type");
    t.dropColumn("expiration_date");
    t.dropColumn("certificates");
    // don’t drop quantity, it was pre-existing
    t.dropColumn("import_country");
    t.dropColumn("entry_border");
    t.dropColumn("exit_border");
    t.dropColumn("preferred_supplier");
  });
}
