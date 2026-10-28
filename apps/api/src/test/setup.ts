import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach } from 'vitest';

// Must be set BEFORE the app code is imported (config/env.ts reads these once).
process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'test-secret-test-secret-test-secret';
process.env.SMTP_HOST = '';

let mongod: MongoMemoryReplSet;

// One throw-away in-memory MongoDB (a one-node replica set, because the code uses transactions) for the whole test file.
beforeAll(async () => {
  mongod = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await mongoose.connect(mongod.getUri('numvexs-test'));
  await mongoose.syncIndexes(); // make sure unique indexes exist, like in real life
});

// Start every test with empty collections.
beforeEach(async () => {
  for (const collection of Object.values(mongoose.connection.collections)) {
    await collection.deleteMany({});
  }
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});
