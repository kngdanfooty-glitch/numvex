import { Schema, model } from 'mongoose';

/*
 * A user's static bank account for funding the wallet. One per user (unique userId), and an account number belongs to one user.
 * 'creating' is a lock while PocketFi is being asked, so two clicks can't ask twice; it becomes 'active' with the account details.
 */
const virtualAccountSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    status: { type: String, enum: ['creating', 'active'], default: 'creating' },
    firstName: { type: String },
    lastName: { type: String },
    bank: { type: String },
    bankName: { type: String },
    accountNumber: { type: String, unique: true, sparse: true },
    accountName: { type: String },
    mode: { type: String, enum: ['test', 'live'] },
  },
  { timestamps: true },
);

export const VirtualAccount = model('VirtualAccount', virtualAccountSchema);
