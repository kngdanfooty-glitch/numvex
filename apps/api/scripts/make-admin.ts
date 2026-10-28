/**
 * Make one existing user an admin (a super admin: every permission) or take it away. Run by hand, once, against the database you point it at.
 *
 *   MONGO_URI='mongodb+srv://...' npx tsx scripts/make-admin.ts someone@example.com            # shows the user, changes nothing
 *   MONGO_URI='mongodb+srv://...' npx tsx scripts/make-admin.ts someone@example.com --confirm   # makes them admin
 *   MONGO_URI='mongodb+srv://...' npx tsx scripts/make-admin.ts someone@example.com --confirm --remove   # back to a normal user
 *
 * The connection string comes from MONGO_URI on the command line ONLY: it is never read from apps/api/.env (that file belongs to the dev
 * server), never printed, and never saved. The user must already exist (they register on the site first). Only `role` is changed.
 */
import mongoose from 'mongoose';

const email = process.argv[2]?.trim().toLowerCase();
const confirm = process.argv.includes('--confirm');
const remove = process.argv.includes('--remove');
const uri = process.env.MONGO_URI;

if (!email || !email.includes('@') || !uri) {
  console.error('Usage: MONGO_URI=... npx tsx scripts/make-admin.ts <email> [--confirm] [--remove]');
  process.exit(1);
}

const where = (() => {
  try {
    const u = new URL(uri);
    return `${u.hostname}${u.pathname}`; // host and database name only: never the user or password
  } catch {
    return 'the given database';
  }
})();

await mongoose.connect(uri, { serverSelectionTimeoutMS: 15_000 });
try {
  const users = mongoose.connection.collection('users');
  const user = await users.findOne({ email });
  if (!user) {
    console.error(`No user with the email ${email} in ${where}. They must register first.`);
    process.exitCode = 2;
  } else {
    const next = remove ? 'user' : 'admin';
    console.log(`Database : ${where}`);
    console.log(`User     : ${user.email} (username ${user.username}), role now "${user.role}", status "${user.status}", verified ${user.isVerified}`);
    console.log(`Admin extras: adminRole=${user.adminRole ?? '(none = super admin)'}, adminPermissions=${user.adminPermissions ? JSON.stringify(user.adminPermissions) : '(none)'}`);
    if (user.role === next) {
      console.log(`Already "${next}". Nothing to do.`);
    } else if (!confirm) {
      console.log(`DRY RUN: would set role to "${next}". Add --confirm to do it.`);
    } else {
      const res = await users.updateOne({ _id: user._id, email }, { $set: { role: next } });
      console.log(res.modifiedCount === 1 ? `Done: ${email} is now "${next}".` : 'Nothing was changed.');
    }
  }
} finally {
  await mongoose.disconnect();
}
