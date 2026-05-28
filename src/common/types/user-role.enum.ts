/**
 * Application roles.
 *
 *  - admin    → full access; can manage users, all products, all orders.
 *  - staff    → read-only admin (analytics, orders, reviews). No destructive ops.
 *  - vendor   → can manage their own products and view orders containing them.
 *  - courier  → last-mile delivery: claim shipped orders, mark out for delivery / delivered.
 *  - customer → default; can shop, manage own profile / orders / wishlist.
 *
 * Assigned to the JWT payload (`role`) and used by the `RolesGuard`.
 */
export enum UserRole {
  ADMIN = 'admin',
  STAFF = 'staff',
  VENDOR = 'vendor',
  COURIER = 'courier',
  CUSTOMER = 'customer',
}

export const ALL_ROLES: UserRole[] = [
  UserRole.ADMIN,
  UserRole.STAFF,
  UserRole.VENDOR,
  UserRole.COURIER,
  UserRole.CUSTOMER,
];

/** Roles that can access the admin console (admin + staff). */
export const ADMIN_CONSOLE_ROLES: UserRole[] = [UserRole.ADMIN, UserRole.STAFF];
