import type { RequestHandler } from 'express';
import { can, effectivePermissions, isSuperAdmin, type AdminMe, type ModuleKey } from '@numvexs/shared';
import { forbidden } from '../lib/errors.js';
import { User } from '../models/User.js';

/*
 * Admin gates. All of them read the user from the DATABASE on every request, never from the sign-in token: a token stays valid for
 * 15 minutes, and someone who has just lost admin rights (or had their sections changed) must not keep them for that long.
 *   requireAdmin          signed in AND an active admin right now; leaves `res.locals.admin` for the handlers
 *   requirePermission(m)  ...and allowed into module `m` (a super admin is allowed into all)
 *   requireSuperAdmin     ...and a super admin (team, audit log)
 */
const NO = () => forbidden('not_admin', 'You do not have access to this.');

export const requireAdmin: RequestHandler = async (_req, res, next) => {
  const user = await User.findById(res.locals.userId).select('role status adminRole adminPermissions email username');
  if (!user || user.role !== 'admin' || user.status !== 'active') throw NO();
  const subject = { role: user.role, adminRole: user.adminRole, adminPermissions: user.adminPermissions };
  const me: AdminMe = {
    email: user.email,
    username: user.username,
    adminRole: user.adminRole || 'super_admin',
    isSuperAdmin: isSuperAdmin(subject),
    permissions: effectivePermissions(subject),
  };
  res.locals.admin = me;
  next();
};

export const requirePermission = (module: ModuleKey): RequestHandler => (_req, res, next) => {
  const me = res.locals.admin as AdminMe | undefined;
  if (!me || !can({ role: 'admin', adminRole: me.isSuperAdmin ? 'super_admin' : me.adminRole, adminPermissions: me.permissions }, module)) {
    throw forbidden('no_access', "You don't have access to this section.");
  }
  next();
};

export const requireSuperAdmin: RequestHandler = (_req, res, next) => {
  if (!(res.locals.admin as AdminMe | undefined)?.isSuperAdmin) throw forbidden('super_admin_only', 'Only a super admin can do this.');
  next();
};
