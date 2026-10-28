import { effectivePermissions, isSuperAdmin, type AddAdminBody, type TeamMember, type UpdateAdminBody } from '@numvexs/shared';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { AdminAction } from '../models/AdminAction.js';
import { User } from '../models/User.js';

/*
 * The admin team (super admin only). Rules that stop anyone locking everyone out:
 *  - you can't change or remove your OWN access;
 *  - the last super admin can't be demoted or removed.
 * Every change is written to the audit log.
 */
const SUPER = { role: 'admin', adminRole: { $in: [null, '', 'super_admin'] } };

const member = (u: InstanceType<typeof User>): TeamMember => {
  const subject = { role: u.role, adminRole: u.adminRole, adminPermissions: u.adminPermissions };
  return {
    id: String(u._id),
    email: u.email,
    username: u.username,
    adminRole: u.adminRole || 'super_admin',
    permissions: effectivePermissions(subject),
    isSuperAdmin: isSuperAdmin(subject),
    createdAt: (u.createdAt as Date).toISOString(),
  };
};

export async function listTeam(): Promise<TeamMember[]> {
  return (await User.find({ role: 'admin' }).sort({ createdAt: 1 })).map(member);
}

/** A role needs its sections: a template role brings its own, "custom" must list at least one. */
function roleFields(adminRole: string, permissions: string[]) {
  if (adminRole === 'custom' && permissions.length === 0) throw badRequest('permissions_required', 'Choose at least one section for a custom role.');
  return { adminRole, adminPermissions: adminRole === 'custom' ? permissions : undefined };
}

export async function addAdmin(actorId: string, body: AddAdminBody): Promise<TeamMember> {
  const key = body.user.trim().toLowerCase();
  const user = await User.findOne({ $or: [{ email: key }, { usernameLower: key }] });
  if (!user) throw notFound('user_not_found', 'No user with that email or username. They need to sign up first.');
  if (user.role === 'admin') throw conflict('already_admin', 'That user is already an admin. Edit their role instead.');
  if (user.status !== 'active' || !user.isVerified) throw conflict('not_eligible', 'Only active, verified users can become admins.');
  const f = roleFields(body.adminRole, body.permissions);
  user.role = 'admin';
  user.adminRole = f.adminRole;
  user.adminPermissions = f.adminPermissions;
  await user.save();
  await AdminAction.create({ adminId: actorId, module: 'roles', action: 'admin_add', userId: user._id, targetRef: String(user._id), details: { adminRole: body.adminRole, permissions: body.permissions } });
  return member(user);
}

export async function updateAdmin(actorId: string, id: string, body: UpdateAdminBody): Promise<TeamMember> {
  const user = await User.findById(id).catch(() => null);
  if (!user || user.role !== 'admin') throw notFound('admin_not_found', 'Admin not found.');
  if (String(user._id) === actorId) throw conflict('self_action', "You can't change your own access. Ask another super admin.");
  const f = roleFields(body.adminRole, body.permissions);
  const losingSuper = isSuperAdmin({ role: user.role, adminRole: user.adminRole }) && body.adminRole !== 'super_admin';
  if (losingSuper && (await User.countDocuments(SUPER as never)) <= 1) throw conflict('last_super_admin', "That's the last super admin. Make someone else a super admin first.");
  const before = { adminRole: user.adminRole || 'super_admin', permissions: user.adminPermissions };
  user.adminRole = f.adminRole;
  user.adminPermissions = f.adminPermissions;
  await user.save();
  await AdminAction.create({ adminId: actorId, module: 'roles', action: 'admin_update', userId: user._id, targetRef: String(user._id), details: { before, after: { adminRole: body.adminRole, permissions: body.permissions } } });
  return member(user);
}

export async function revokeAdmin(actorId: string, id: string): Promise<void> {
  const user = await User.findById(id).catch(() => null);
  if (!user || user.role !== 'admin') throw notFound('admin_not_found', 'Admin not found.');
  if (String(user._id) === actorId) throw conflict('self_action', "You can't remove your own access. Ask another super admin.");
  if (isSuperAdmin({ role: user.role, adminRole: user.adminRole }) && (await User.countDocuments(SUPER as never)) <= 1) {
    throw conflict('last_super_admin', "That's the last super admin and can't be removed.");
  }
  user.role = 'user';
  user.adminRole = undefined;
  user.adminPermissions = undefined;
  await user.save();
  await AdminAction.create({ adminId: actorId, module: 'roles', action: 'admin_revoke', userId: user._id, targetRef: String(user._id) });
}
