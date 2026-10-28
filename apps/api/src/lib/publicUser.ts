import type { PublicUser } from '@numvexs/shared';
import type { User } from '../models/User.js';

type UserDoc = InstanceType<typeof User>;

/** The safe-to-send version of a user. Notice: no passwordHash. */
export function toPublicUser(user: UserDoc): PublicUser {
  return {
    id: String(user._id),
    email: user.email,
    username: user.username,
    phone: user.phone ?? null,
    role: user.role,
    status: user.status,
    isVerified: user.isVerified,
    balanceKobo: user.balanceKobo,
    twoFactorEnabled: user.twoFactorEnabled,
    createdAt: user.createdAt.toISOString(),
  };
}
