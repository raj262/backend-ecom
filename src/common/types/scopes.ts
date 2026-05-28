/**
 * Capability catalog used by custom (admin-defined) roles.
 *
 * Each scope is a `<resource>:<action>` string. When an admin creates a
 * custom role, they pick from this list — keeping the surface area
 * documented and finite (no free-text "admin can do `xss-attack`").
 *
 * Built-in roles ignore this list (they have hard-coded enum-based
 * permissions in `RolesGuard`). Custom roles will be enforced via a
 * `ScopesGuard` in a follow-up — today the scopes are descriptive,
 * surfaced in the UI, and stored for audit.
 */
export const SCOPES = [
  // catalog
  'products:read',
  'products:write',
  'categories:write',
  'reviews:moderate',

  // commerce
  'orders:read',
  'orders:write',
  'payments:read',
  'payments:write',
  'coupons:write',
  'shipping:manage',
  'inventory:write',

  // people
  'users:read',
  'users:write',
  'roles:manage',

  // insights
  'analytics:view',
  'notifications:read',
] as const;

export type Scope = (typeof SCOPES)[number];

export interface ScopeGroup {
  label: string;
  scopes: Scope[];
}

/** Grouping used by the admin Roles UI to render the scope picker. */
export const SCOPE_GROUPS: ScopeGroup[] = [
  {
    label: 'Catalog',
    scopes: [
      'products:read',
      'products:write',
      'categories:write',
      'reviews:moderate',
    ],
  },
  {
    label: 'Commerce',
    scopes: [
      'orders:read',
      'orders:write',
      'payments:read',
      'payments:write',
      'coupons:write',
      'shipping:manage',
      'inventory:write',
    ],
  },
  {
    label: 'People',
    scopes: ['users:read', 'users:write', 'roles:manage'],
  },
  {
    label: 'Insights',
    scopes: ['analytics:view', 'notifications:read'],
  },
];
