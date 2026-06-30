// knex migration: relax notifications.type check & (re)assert status check
// Filename example: 20250201_relax_notifications_type_check.js

export async function up(knex) {
  // 1) Drop existing TYPE check constraint if present
  await knex.schema.raw(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'notifications_type_check'
          AND conrelid = 'public.notifications'::regclass
      ) THEN
        ALTER TABLE public.notifications
        DROP CONSTRAINT notifications_type_check;
      END IF;
    END
    $$;
  `);

  // 2) Add a permissive TYPE check: non-null & non-empty
  await knex.schema.raw(`
    ALTER TABLE public.notifications
    ADD CONSTRAINT notifications_type_check
      CHECK (type IS NOT NULL AND btrim(type) <> '');
  `);

  // 3) Ensure STATUS default and check constraint are correct
  //    Drop old status check if exists
  await knex.schema.raw(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'notifications_status_check'
          AND conrelid = 'public.notifications'::regclass
      ) THEN
        ALTER TABLE public.notifications
        DROP CONSTRAINT notifications_status_check;
      END IF;
    END
    $$;
  `);

  // 4) Set default to 'unread' (idempotent) and add strict status check
  await knex.schema.raw(`
    ALTER TABLE public.notifications
    ALTER COLUMN status SET DEFAULT 'unread',
    ADD CONSTRAINT notifications_status_check
      CHECK (status IN ('unread','read'));
  `);
}

export async function down(knex) {
  // Revert to a whitelist type check (optional: match your older allowed set).
  // Adjust this list if your legacy constraint had different values.
  await knex.schema.raw(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'notifications_type_check'
          AND conrelid = 'public.notifications'::regclass
      ) THEN
        ALTER TABLE public.notifications
        DROP CONSTRAINT notifications_type_check;
      END IF;
    END
    $$;
  `);

  // Example legacy set; change if your previous DB used a different set
  await knex.schema.raw(`
    ALTER TABLE public.notifications
    ADD CONSTRAINT notifications_type_check
      CHECK (type IN (
        'status_updated',
        'request_accepted',
        'new_request',
        'completed',
        'new_file_upload',
        'new_application'
      ));
  `);

  // Drop our stricter status check & revert default if you want (optional)
  await knex.schema.raw(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'notifications_status_check'
          AND conrelid = 'public.notifications'::regclass
      ) THEN
        ALTER TABLE public.notifications
        DROP CONSTRAINT notifications_status_check;
      END IF;
    END
    $$;
  `);

  // You can keep the default or remove it; here we keep 'unread'
  await knex.schema.raw(`
    ALTER TABLE public.notifications
    ALTER COLUMN status SET DEFAULT 'unread';
  `);
}
