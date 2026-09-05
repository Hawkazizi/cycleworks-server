/**
 * Canonical role names used across the API.
 *
 * ⚠️  The VALUES are the *database* role names (`roles.name`) and must NOT be
 * renamed — existing rows in `roles`, `user_roles`, `admin_license_keys` and
 * previously issued JWTs all reference them.
 *
 * Naming map (business name → stored DB value):
 *   سوپر ادمین      (super admin)   → "super_admin"
 *   کارشناس         (specialist)    → "admin"
 *   مدیر            (manager)       → "manager"
 *   تامین‌کننده     (supplier)      → "user"
 *   مشتری           (customer)      → "buyer"
 *   کنترل کیفیت داخلی (qc internal) → "qc_internal"
 *   کنترل کیفیت خارجی (qc external) → "qc_external"
 */
export const ROLES = {
  SUPER_ADMIN: "super_admin",
  ADMIN: "admin",
  MANAGER: "manager",
  SUPPLIER: "user",
  CUSTOMER: "buyer",
  QC_INTERNAL: "qc_internal",
  QC_EXTERNAL: "qc_external",
};

/** Roles that see every request: کارشناس + مدیر */
export const ADMIN_MANAGER_ROLES = [ROLES.ADMIN, ROLES.MANAGER];

/** Roles with full super-admin power (used by the superadmin module) */
export const SUPER_ADMIN_POWER_ROLES = [
  ROLES.ADMIN,
  ROLES.MANAGER,
  ROLES.SUPER_ADMIN,
];

/** QC roles (internal + external) */
export const QC_ROLES = [ROLES.QC_INTERNAL, ROLES.QC_EXTERNAL];
