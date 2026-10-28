import { Schema, model, type Types } from 'mongoose';

/*
 * A login session. The browser holds a random "refresh token" in a cookie; we keep
 * only its hash here. While it's valid, the browser can get fresh short-lived access
 * tokens without asking for the password again. Deleting the row = logging out.
 */
const refreshTokenSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  tokenHash: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
});

export type RefreshTokenUserId = Types.ObjectId;
export const RefreshToken = model('RefreshToken', refreshTokenSchema);
