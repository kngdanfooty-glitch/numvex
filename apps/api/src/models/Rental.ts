import { Schema, model } from 'mongoose';

/*
 * One rented number. `costKobo` is everything the user paid for it (the first rental plus every extension, all already taken
 * from their wallet). `refundedKobo` only grows when the provider refused a purchase or an extension.
 * `placing` also covers a purchase whose outcome we could not confirm: the money stays held (never refunded blindly) until someone checks.
 */
const messageSchema = new Schema(
  {
    msgId: { type: String, required: true },
    from: { type: String },
    text: { type: String, required: true },
    code: { type: String },
    receivedAt: { type: Date, required: true },
  },
  { _id: false },
);

const extensionSchema = new Schema(
  {
    requestId: { type: String, required: true },
    optionId: { type: String, required: true },
    days: { type: Number, required: true },
    costKobo: { type: Number, required: true },
    status: { type: String, enum: ['pending', 'ok', 'failed'], default: 'pending' },
    // Set by hand: a $push / positional update does not stamp sub-documents.
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
  },
  { _id: false },
);

const rentalSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    requestId: { type: String, required: true },
    server: { type: String, required: true },
    countryId: { type: String, required: true },
    countryName: { type: String, required: true },
    optionId: { type: String, required: true },
    label: { type: String, required: true },
    totalDays: { type: Number, required: true },
    number: { type: String },
    providerRef: { type: String },
    costKobo: { type: Number, required: true },
    refundedKobo: { type: Number, default: 0 },
    status: { type: String, enum: ['placing', 'active', 'expired', 'failed'], default: 'placing' },
    expiresAt: { type: Date },
    lastPolledAt: { type: Date },
    messages: { type: [messageSchema], default: [] },
    extensions: { type: [extensionSchema], default: [] },
  },
  { timestamps: true },
);
rentalSchema.index({ userId: 1, requestId: 1 }, { unique: true });
rentalSchema.index({ status: 1, lastPolledAt: 1 });

export const Rental = model('Rental', rentalSchema);
