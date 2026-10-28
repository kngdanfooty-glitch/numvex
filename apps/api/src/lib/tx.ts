import mongoose, { type ClientSession } from 'mongoose';

/*
 * Run several database writes as ONE: either all of them happen or none do, even if the server dies halfway.
 * Used wherever money moves together with a record of why (charge + order, refund + "refunded" mark, deposit + credit).
 * A write conflict with another request is retried automatically. Needs a MongoDB replica set (Atlas is one; the dev database is too).
 * Pass `session` to every query inside: `User.updateOne(filter, update, { session })`.
 */
export function inTx<T>(work: (session: ClientSession) => Promise<T>): Promise<T> {
  return mongoose.connection.transaction(work);
}
