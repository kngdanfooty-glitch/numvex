import { Schema, model } from 'mongoose';

/*
 * One bought number. `costKobo` is what the user paid (already taken from their wallet).
 * `status` only ever moves pending -> completed (code arrived) or pending -> cancelled (refunded).
 */
const activationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    server: { type: String, required: true },
    providerOrderId: { type: String, required: true },
    number: { type: String, required: true },
    service: { type: String, required: true },
    country: { type: String, required: true },
    costKobo: { type: Number, required: true },
    status: { type: String, enum: ['pending', 'completed', 'cancelled'], default: 'pending' },
    code: { type: String },
    expiresAt: { type: Date, required: true },
    lastPolledAt: { type: Date }, // when the poll job last asked the provider about this number
  },
  { timestamps: true },
);

export const Activation = model('Activation', activationSchema);
