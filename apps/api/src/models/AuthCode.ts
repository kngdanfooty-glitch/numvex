import { Schema, model } from 'mongoose';

/*
 * A 6-digit code we emailed someone. Two kinds:
 *   'verify_email'   -> proves they own the email after sign-up
 *   'reset_password' -> lets them choose a new password
 *
 * We store only a HASH of the code (like a password), so even a leaked database
 * can't reveal live codes. There is at most ONE code per (email, purpose): asking
 * for a new one replaces the old one.
 */
const authCodeSchema = new Schema({
  email: { type: String, required: true, lowercase: true },
  purpose: { type: String, enum: ['verify_email', 'reset_password'], required: true },
  codeHash: { type: String, required: true },
  attempts: { type: Number, default: 0 }, // wrong guesses so far
  sentAt: { type: Date, default: () => new Date() }, // used for the resend cooldown
  // MongoDB deletes the document automatically once this time passes.
  expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
});

authCodeSchema.index({ email: 1, purpose: 1 }, { unique: true });

export const AuthCode = model('AuthCode', authCodeSchema);
