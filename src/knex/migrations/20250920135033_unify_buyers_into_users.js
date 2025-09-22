export async function up(knex) {
  await knex.transaction(async (trx) => {
    // 0) Ensure role 'buyer' exists
    const [buyerRole] = await trx("roles")
      .insert({ name: "buyer" })
      .onConflict("name")
      .ignore()
      .returning("*");

    const buyerRoleRow =
      buyerRole ||
      (await trx("roles").where({ name: "buyer" }).first());

    // 1) Add temporary user-based column on buyer_requests
    //    (we will migrate data into this, then swap)
    await trx.schema.alterTable("buyer_requests", (t) => {
      t.integer("buyer_user_id").unsigned().nullable();
    });

    // 2) Insert missing users for existing rows in `buyers`
    //    Only create users that don't match by email OR mobile
    await trx.raw(`
      INSERT INTO users (name, email, password_hash, mobile, status, created_at)
      SELECT b.name, b.email, b.password_hash, b.mobile, b.status, b.created_at
      FROM buyers b
      WHERE NOT EXISTS (
        SELECT 1 FROM users u
        WHERE (u.email IS NOT DISTINCT FROM b.email)
           OR (u.mobile IS NOT DISTINCT FROM b.mobile)
      );
    `);

    // 3) Attach 'buyer' role to users that correspond to any buyer row
    //    (match by email OR mobile)
    await trx.raw(`
      INSERT INTO user_roles (user_id, role_id)
      SELECT DISTINCT u.id, ${buyerRoleRow.id}
      FROM buyers b
      JOIN users u
        ON (u.email IS NOT DISTINCT FROM b.email)
        OR (u.mobile IS NOT DISTINCT FROM b.mobile)
      ON CONFLICT (user_id, role_id) DO NOTHING;
    `);

    // 4) Migrate buyer_requests.buyer_id -> buyer_requests.buyer_user_id (users.id)
    //    Join buyers to users by email/mobile, using the existing buyer_id linkage
    await trx.raw(`
      UPDATE buyer_requests br
      SET buyer_user_id = u.id
      FROM buyers b
      JOIN users u
        ON (u.email IS NOT DISTINCT FROM b.email)
        OR (u.mobile IS NOT DISTINCT FROM b.mobile)
      WHERE br.buyer_id = b.id;
    `);

    // 5) Sanity check: no nulls allowed after migration
    const { rows: nulls } = await trx.raw(
      `SELECT COUNT(*)::int AS c FROM buyer_requests WHERE buyer_user_id IS NULL;`
    );
    if (nulls[0].c > 0) {
      throw new Error(
        `Unification failed: ${nulls[0].c} buyer_requests could not map to users.`
      );
    }

    // 6) Drop old FK column and rename new column
    // NOTE: dropping the column removes its FK automatically
    await trx.schema.alterTable("buyer_requests", (t) => {
      t.dropColumn("buyer_id"); // old reference to buyers(id)
    });

    await trx.schema.alterTable("buyer_requests", (t) => {
      t.renameColumn("buyer_user_id", "buyer_id");
    });

    // 7) Add NOT NULL + FK to users(id)
    await trx.raw(`
      ALTER TABLE buyer_requests
      ALTER COLUMN buyer_id SET NOT NULL;
    `);
    await trx.raw(`
      ALTER TABLE buyer_requests
      ADD CONSTRAINT buyer_requests_buyer_id_fkey
      FOREIGN KEY (buyer_id) REFERENCES users(id) ON DELETE CASCADE;
    `);

    // 8) Drop the buyers table now that all references are gone
    await trx.schema.dropTableIfExists("buyers");
  });
}

export async function down(knex) {
  // Best effort rollback to the old world (recreate buyers and re-point)
  await knex.transaction(async (trx) => {
    // 1) Recreate buyers
    await trx.schema.createTable("buyers", (t) => {
      t.increments("id").primary();
      t.string("name", 100).notNullable();
      t.string("email", 150).unique();
      t.text("password_hash").notNullable();
      t.string("mobile", 20).unique();
      t.string("status", 20).defaultTo("pending");
      t.timestamp("created_at").defaultTo(trx.fn.now());
    });

    // 2) Seed buyers from users who have the 'buyer' role
    const buyerRole = await trx("roles").where({ name: "buyer" }).first();
    if (buyerRole) {
      await trx.raw(`
        INSERT INTO buyers (name, email, password_hash, mobile, status, created_at)
        SELECT u.name, u.email, u.password_hash, u.mobile, u.status, u.created_at
        FROM users u
        JOIN user_roles ur ON ur.user_id = u.id AND ur.role_id = ${buyerRole.id}
        ON CONFLICT (email) DO NOTHING;
      `);
    }

    // 3) Add a temp old-world column back
    await trx.schema.alterTable("buyer_requests", (t) => {
      t.integer("buyer_old_id").unsigned().nullable();
    });

    // 4) Map users -> buyers by email/mobile
    await trx.raw(`
      UPDATE buyer_requests br
      SET buyer_old_id = b.id
      FROM users u
      JOIN buyers b
        ON (b.email IS NOT DISTINCT FROM u.email)
        OR (b.mobile IS NOT DISTINCT FROM u.mobile)
      WHERE br.buyer_id = u.id;
    `);

    const { rows: nulls } = await trx.raw(
      `SELECT COUNT(*)::int AS c FROM buyer_requests WHERE buyer_old_id IS NULL;`
    );
    if (nulls[0].c > 0) {
      throw new Error(
        \`Down migration failed: \${nulls[0].c} buyer_requests couldn't map back to buyers.\`
      );
    }

    // 5) Swap columns: drop users FK, rename buyer_old_id->buyer_id, add FK to buyers
    await trx.raw(`
      ALTER TABLE buyer_requests DROP CONSTRAINT IF EXISTS buyer_requests_buyer_id_fkey;
    `);
    await trx.schema.alterTable("buyer_requests", (t) => {
      t.dropColumn("buyer_id");
    });
    await trx.schema.alterTable("buyer_requests", (t) => {
      t.renameColumn("buyer_old_id", "buyer_id");
    });
    await trx.raw(`
      ALTER TABLE buyer_requests
      ALTER COLUMN buyer_id SET NOT NULL;
    `);
    await trx.raw(`
      ALTER TABLE buyer_requests
      ADD CONSTRAINT buyer_requests_buyer_id_fkey
      FOREIGN KEY (buyer_id) REFERENCES buyers(id) ON DELETE CASCADE;
    `);
  });
}
