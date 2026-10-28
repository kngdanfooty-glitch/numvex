import { Schema, model } from 'mongoose';

/*
 * One bank transfer PocketFi told us about. `reference` is PocketFi's unique id for it: the unique index is what makes a deposit
 * credit exactly once, however many times the webhook is delivered.
 *  credited   the wallet got `amountKobo`
 *  unmatched  we could not tell whose account was paid (the webhook doesn't have to name it): NOT credited, needs a person
 */
const walletDepositSchema = new Schema(
  {
    reference: { type: String, required: true, unique: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    accountNumber: { type: String },
    amountKobo: { type: Number, required: true },
    status: { type: String, enum: ['credited', 'unmatched'], required: true },
    // The webhook body as received, for support. It holds no secrets (PocketFi sends none).
    payload: { type: Schema.Types.Mixed },
  },
  { timestamps: true },
);

export const WalletDeposit = model('WalletDeposit', walletDepositSchema);
