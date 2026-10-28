/**
 * Zero-dependency local MongoDB for development when Docker isn't available.
 *
 * Starts a single-node replica set (so Mongoose transactions work) on a fixed
 * port with an on-disk data path, so data survives restarts. Leave it running
 * in its own terminal:  npm run db:mem
 */
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

const here = dirname(fileURLToPath(import.meta.url));
const dbPath = resolve(here, '../.mongo-data');
const port = Number(process.env.DEV_MONGO_PORT ?? 27019);

if (!existsSync(dbPath)) mkdirSync(dbPath, { recursive: true });

const replSet = await MongoMemoryReplSet.create({
  replSet: { name: 'rs0', count: 1, storageEngine: 'wiredTiger' },
  // Fixed port + on-disk dbPath so seeded data and accounts survive a restart.
  instanceOpts: [{ port, dbPath, storageEngine: 'wiredTiger' }],
});

const uri = `mongodb://localhost:${port}/numvexs?replicaSet=rs0&directConnection=true`;
console.log('\n  MongoDB (in-memory replica set) is up.');
console.log(`  URI: ${uri}`);
console.log(`  Data: ${dbPath}`);
console.log('\n  Put this in apps/api/.env if it differs:');
console.log(`  MONGODB_URI=${uri}\n`);
console.log('  Press Ctrl+C to stop.\n');

const shutdown = async () => {
  console.log('\n  stopping mongo...');
  await replSet.stop();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
