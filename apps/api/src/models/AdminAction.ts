import { Schema, model } from 'mongoose';

/*
 * The audit log: one row per thing an admin did that changed something (money, an order, a user, a setting, the team).
 * The app only ever adds rows; it never edits or deletes them. Money actions carry `userId`, `amountKobo` and `reason`;
 * other changes carry `details` (what was sent, with secrets removed).
 */
const adminActionSchema = new Schema(
  {
    adminId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    adminEmail: { type: String },
    module: { type: String, default: 'wallet', index: true },
    action: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    amountKobo: { type: Number },
    targetRef: { type: String }, // the deposit reference, order id or setting this was about
    reason: { type: String },
    details: { type: Schema.Types.Mixed },
    ip: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
adminActionSchema.index({ createdAt: -1 });

export const AdminAction = model('AdminAction', adminActionSchema);
