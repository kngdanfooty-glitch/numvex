import { Schema, model } from 'mongoose';

/*
 * One bought eSIM. `costKobo` is what the user paid (already taken from their wallet). `refundedKobo` goes from 0 to the
 * full price once, only if the provider refused the purchase. `details` holds what the buyer needs to install it.
 */
const esimOrderSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    requestId: { type: String, required: true },
    server: { type: String, required: true },
    planId: { type: String, required: true },
    countryId: { type: String, required: true },
    countryName: { type: String, required: true },
    planSummary: { type: String, required: true },
    costKobo: { type: Number, required: true },
    providerRef: { type: String },
    status: { type: String, enum: ['placing', 'active', 'failed'], default: 'placing' },
    refundedKobo: { type: Number, default: 0 },
    details: { type: Schema.Types.Mixed },
  },
  { timestamps: true },
);
esimOrderSchema.index({ userId: 1, requestId: 1 }, { unique: true });

export const EsimOrder = model('EsimOrder', esimOrderSchema);
