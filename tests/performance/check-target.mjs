import mongoose from '/app/node_modules/mongoose/index.js';
import { validateRunDatabase } from '/perf/test-target.mjs';

const database = validateRunDatabase(process.env.MONGO_URI, process.env.TEST_DB_NAME, process.env.TEST_RUN_ID);
await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 5000, readPreference: 'primary' });
if (mongoose.connection.name !== database || mongoose.connection.host !== 'mongo-performance') {
  await mongoose.disconnect();
  throw new Error('Live MongoDB connection does not match the isolated performance database.');
}
console.log(JSON.stringify({ database: mongoose.connection.name, host: mongoose.connection.host, runId: process.env.TEST_RUN_ID }));
await mongoose.disconnect();
