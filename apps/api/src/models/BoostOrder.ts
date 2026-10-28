import { Schema, model } from 'mongoose';
import { BOOST_ORDER_STATUSES } from '@numvexs/shared';

/*
 * One boost order. `costKobo` is what the user paid (already taken from their wallet).
 * `refundedKobo` only ever goes from 0 to a final amount, once: that is what stops a double refund.
 * placing -> pending -> in_progress -> completed | partial | canceled; or placing -> failed when the panel refused it.
 */
const boostOrderSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    // Made up by the page for each order form: the same one twice means "the same order", not a second charge.
    requestId: { type: String, required: true },
    server: { type: String, required: true },
    serviceId: { type: String, required: true },
    serviceName: { type: String, required: true },
    link: { type: String, required: true },
    quantity: { type: Number, required: true },
    costKobo: { type: Number, required: true },
    panelOrderId: { type: String },
    status: { type: String, enum: BOOST_ORDER_STATUSES, default: 'placing' },
    panelStatus: { type: String },
    startCount: { type: Number },
    remains: { type: Number },
    refundedKobo: { type: Number, default: 0 },
    lastCheckedAt: { type: Date },
  },
  { timestamps: true },
);
boostOrderSchema.index({ userId: 1, requestId: 1 }, { unique: true });
boostOrderSchema.index({ status: 1, lastCheckedAt: 1 });

export const BoostOrder = model('BoostOrder', boostOrderSchema);
