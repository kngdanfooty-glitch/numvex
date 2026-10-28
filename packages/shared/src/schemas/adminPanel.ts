import { z } from 'zod';
import { reasonSchema, whoSchema } from './admin';

/* ====================================================================================================================
 * The admin panel (modelled on FloZap's): who may open which section, and the shapes the panel reads and writes.
 * ==================================================================================================================== */

export const ADMIN_MODULES = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'users', label: 'Users' },
  { key: 'wallet', label: 'Wallet & deposits' },
  { key: 'orders', label: 'Orders' },
  { key: 'reports', label: 'Finance reports' },
  { key: 'prices', label: 'Pricing' },
  { key: 'settings', label: 'Services & settings' },
  { key: 'roles', label: 'Admin team & audit log' },
] as const;
export type ModuleKey = (typeof ADMIN_MODULES)[number]['key'];
export const MODULE_KEYS = ADMIN_MODULES.map((m) => m.key) as ModuleKey[];
const moduleEnum = z.enum(MODULE_KEYS as [ModuleKey, ...ModuleKey[]]);

/** Ready-made roles. A super admin has every module; anyone else only the modules listed for them. */
export const ROLE_TEMPLATES: Record<string, ModuleKey[]> = {
  support_agent: ['dashboard', 'users', 'orders'],
  finance_officer: ['dashboard', 'wallet', 'orders', 'reports', 'prices'],
};
export const ADMIN_ROLES = ['super_admin', ...Object.keys(ROLE_TEMPLATES), 'custom'] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

interface PermissionSubject {
  role?: string;
  adminRole?: string | null;
  adminPermissions?: string[] | null;
}

/** An admin with no specific role is a super admin: that is how the first admin (set by hand in the database) gets in. */
export const isSuperAdmin = (u?: PermissionSubject | null) => u?.role === 'admin' && (!u.adminRole || u.adminRole === 'super_admin');

export function effectivePermissions(u?: PermissionSubject | null): ModuleKey[] {
  if (!u || u.role !== 'admin') return [];
  if (isSuperAdmin(u)) return MODULE_KEYS;
  const own = (u.adminPermissions ?? []).filter((k): k is ModuleKey => (MODULE_KEYS as string[]).includes(k));
  if (own.length) return own;
  return ROLE_TEMPLATES[u.adminRole ?? ''] ?? [];
}
export const can = (u: PermissionSubject | null | undefined, module: ModuleKey) => isSuperAdmin(u) || effectivePermissions(u).includes(module);

export interface AdminMe {
  email: string;
  username: string;
  adminRole: string;
  isSuperAdmin: boolean;
  permissions: ModuleKey[];
}

/* ---- dashboard ---- */
export interface DayPoint {
  day: string;
  value: number;
}
export interface DashboardData {
  /** The three money totals are null for an admin without the Finance section (a support agent), and the server does not even work them out. */
  totals: { users: number; newUsers30d: number; walletFloatKobo: number | null; depositsTodayKobo: number | null; depositsMonthKobo: number | null };
  /** Orders placed per service, today and in the last 30 days. */
  orders: Record<'numbers' | 'boost' | 'esim' | 'rentals' | 'telegram', { today: number; month: number }>;
  needsAttention: { unmatchedDeposits: number; telegramReview: number; stuckNumbers: number };
  revenueTrend: DayPoint[] | null; // kobo kept per day: charged minus refunded (null without Finance)
  userGrowth: DayPoint[];
  recent: { id: string; title: string; user: string; amountKobo: number | null; createdAt: string }[];
}

/* ---- users ---- */
export const userListQuerySchema = z.object({
  search: z.string().trim().max(80).optional(),
  status: z.enum(['active', 'suspended']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(15),
});
export type UserListQuery = z.infer<typeof userListQuerySchema>;

export interface AdminUserRow {
  id: string;
  email: string;
  username: string;
  phone: string | null;
  role: string;
  status: 'active' | 'suspended';
  isVerified: boolean;
  balanceKobo: number;
  createdAt: string;
}
export interface Paged<T> {
  items: T[];
  page: number;
  totalPages: number;
  total: number;
}
export interface AdminUserDetail extends AdminUserRow {
  account: { bankName: string; accountNumber: string } | null;
  counts: { numbers: number; boost: number; esim: number; rentals: number; telegram: number };
  spentKobo: number;
  depositedKobo: number;
}
export const suspendSchema = z.object({ reason: reasonSchema });

/* ---- orders & deposits ---- */
export const ORDER_KINDS = ['numbers', 'boost', 'esim', 'rentals', 'telegram'] as const;
export type OrderKind = (typeof ORDER_KINDS)[number];
export const orderListQuerySchema = z.object({
  kind: z.enum(ORDER_KINDS),
  status: z.string().trim().max(30).optional(),
  search: z.string().trim().max(80).optional(), // a user's email or username
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(15),
});
export type OrderListQuery = z.infer<typeof orderListQuerySchema>;
export interface AdminOrderRow {
  id: string;
  user: string;
  title: string;
  detail: string | null;
  status: string;
  costKobo: number;
  refundedKobo: number;
  createdAt: string;
}

export const depositListQuerySchema = z.object({
  status: z.enum(['credited', 'unmatched']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(15),
});
export type DepositListQuery = z.infer<typeof depositListQuerySchema>;
export interface AdminDepositRow {
  id: string;
  reference: string;
  user: string | null;
  accountNumber: string | null;
  amountKobo: number;
  status: 'credited' | 'unmatched';
  createdAt: string;
}

/* ---- finance ---- */
export interface FinanceRow {
  service: 'numbers' | 'boost' | 'esim' | 'rentals' | 'telegram';
  orders: number;
  chargedKobo: number;
  refundedKobo: number;
  netKobo: number;
}
export interface FinanceReport {
  days: number;
  rows: FinanceRow[];
  totals: { chargedKobo: number; refundedKobo: number; netKobo: number; depositedKobo: number; walletFloatKobo: number };
}
export const financeQuerySchema = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) });

/* ---- pricing and service switches ---- */
export const SERVICE_KEYS = ['numbers', 'boost', 'esim', 'rentals', 'telegram', 'deposits'] as const;
export type ServiceKey = (typeof SERVICE_KEYS)[number];

export const pricingSchema = z.object({
  usdNgnRate: z.number().positive().max(100_000),
  eurUsdRate: z.number().positive().max(100),
  numberMarkupPercent: z.number().min(0).max(1_000),
  boostMarkupPercent: z.number().min(0).max(1_000),
  esimMarkupPercent: z.number().min(0).max(1_000),
  rentalMarkupPercent: z.number().min(0).max(1_000),
  telegramMarkupPercent: z.number().min(0).max(1_000),
});
export type PricingSettings = z.infer<typeof pricingSchema>;
export const savePricingSchema = z.object({ pricing: pricingSchema, reason: reasonSchema });
export type SavePricingBody = z.infer<typeof savePricingSchema>;

export interface ServiceSettings {
  toggles: Record<ServiceKey, boolean>;
  /** Servers switched off one by one: "numbers:smspool", "boost:peakerr"... */
  disabledServers: string[];
}
export const serviceSettingsSchema = z.object({
  toggles: z.object({ numbers: z.boolean(), boost: z.boolean(), esim: z.boolean(), rentals: z.boolean(), telegram: z.boolean(), deposits: z.boolean() }),
  disabledServers: z.array(z.string().regex(/^(numbers|boost|esim|rentals):[a-z0-9]+$/)).max(40),
});
export const saveServicesSchema = z.object({ services: serviceSettingsSchema, reason: reasonSchema });
export type SaveServicesBody = z.infer<typeof saveServicesSchema>;

/* ---- team ---- */
export interface TeamMember {
  id: string;
  email: string;
  username: string;
  adminRole: string;
  permissions: ModuleKey[];
  isSuperAdmin: boolean;
  createdAt: string;
}
export const addAdminSchema = z.object({
  user: whoSchema,
  adminRole: z.enum(ADMIN_ROLES),
  permissions: z.array(moduleEnum).max(MODULE_KEYS.length).default([]),
});
export type AddAdminBody = z.infer<typeof addAdminSchema>;
export const updateAdminSchema = z.object({
  adminRole: z.enum(ADMIN_ROLES),
  permissions: z.array(moduleEnum).max(MODULE_KEYS.length).default([]),
});
export type UpdateAdminBody = z.infer<typeof updateAdminSchema>;

/* ---- audit log ---- */
export interface AuditEntry {
  id: string;
  admin: string;
  module: string;
  action: string;
  target: string | null;
  user: string | null;
  amountKobo: number | null;
  reason: string | null;
  details: Record<string, unknown> | null;
  createdAt: string;
}
export const auditQuerySchema = z.object({
  module: z.string().trim().max(30).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
