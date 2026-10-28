import { Schema, model } from 'mongoose';

/*
 * A user account.
 * - email is stored lowercase so lookups are case-insensitive (see `usernameLower` below for usernames).
 * - we never store the password, only `passwordHash` (argon2).
 * - balanceKobo is the wallet in kobo (1 naira = 100 kobo), always an integer. Nothing changes it yet.
 */
const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    // `username` is shown as the user typed it ("Abassgold"). `usernameLower` is the same name
    // in lowercase, used for uniqueness and login, so "Abassgold" and "abassgold" can't both exist.
    username: { type: String, required: true, trim: true },
    usernameLower: { type: String, required: true, unique: true, lowercase: true, trim: true },
    // Nigerian mobile number in the standard form (+234…). Unique, so one number can't make many accounts.
    // Not `required` only because accounts created before this field existed don't have one.
    phone: { type: String, unique: true, sparse: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    // Only for admins. No adminRole = super admin (the first admin is set by hand in the database). See ADMIN_MODULES in @numvexs/shared.
    adminRole: { type: String },
    adminPermissions: { type: [String], default: undefined },
    status: { type: String, enum: ['active', 'suspended'], default: 'active' },
    isVerified: { type: Boolean, default: false },
    balanceKobo: { type: Number, default: 0 },
    twoFactorEnabled: { type: Boolean, default: false },
    referredBy: { type: String },
  },
  { timestamps: true },
);

export const User = model('User', userSchema);
