export async function up(knex) {
  await knex.schema.alterTable("buyer_requests", (table) => {
    table.integer("allocated_containers").notNullable().defaultTo(0);

    table.string("allocation_status", 20).notNullable().defaultTo("pending");
  });

  /**
   * 🔄 Backfill existing data
   * For old requests, we calculate allocation from containers
   */
  await knex.raw(`
    UPDATE buyer_requests br
    SET
      allocated_containers = sub.assigned_count,
      allocation_status = CASE
        WHEN sub.assigned_count = 0 THEN 'pending'
        WHEN br.container_amount IS NOT NULL
             AND sub.assigned_count < br.container_amount THEN 'partial'
        WHEN br.container_amount IS NOT NULL
             AND sub.assigned_count >= br.container_amount THEN 'completed'
        ELSE 'pending'
      END
    FROM (
      SELECT
        fp.request_id,
        COUNT(c.id) FILTER (WHERE c.supplier_id IS NOT NULL) AS assigned_count
      FROM farmer_plans fp
      JOIN farmer_plan_containers c ON c.plan_id = fp.id
      GROUP BY fp.request_id
    ) sub
    WHERE br.id = sub.request_id;
  `);
}

export async function down(knex) {
  await knex.schema.alterTable("buyer_requests", (table) => {
    table.dropColumn("allocated_containers");
    table.dropColumn("allocation_status");
  });
}
