import { Schema, model } from 'mongoose';

/*
 * One Telegram Premium / Stars order. `costKobo` is what the user paid (taken from their wallet first). `refundedKobo` goes from
 * 0 to the full price once, only when GramSubs refused or failed the order. 'review' means we could not tell whether GramSubs
 * took the order (the connection dropped after we sent it): the money stays held until someone checks it at GramSubs.
 */
const telegramOrderSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    requestId: { type: String, required: true },
    service: { type: String, enum: ['premium', 'stars'], required: true },
    /** Months (premium) or stars. */
    units: { type: Number, required: true },
    username: { type: String, required: true },
    recipient: { type: String, required: true },
    recipientName: { type: String },
    costKobo: { type: Number, required: true },
    /** What GramSubs charged us, in US cents. */
    usdCents: { type: Number, required: true },
    providerRef: { type: String },
    mode: { type: String, enum: ['live', 'test'] },
    status: { type: String, enum: ['placing', 'processing', 'delivered', 'failed', 'review'], default: 'placing', index: true },
    refundedKobo: { type: Number, default: 0 },
    failReason: { type: String },
  },
  { timestamps: true },
);
telegramOrderSchema.index({ userId: 1, requestId: 1 }, { unique: true });

export const TelegramOrder = model('TelegramOrder', telegramOrderSchema);
