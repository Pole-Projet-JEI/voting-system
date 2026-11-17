export const composeProject = process.env.INTEGRATION_COMPOSE_PROJECT || 'voting-performance-test';
export const allowedBaseUrl = `http://127.0.0.1:${process.env.API_PORT || '3180'}`;
export const databaseVolume = process.env.INTEGRATION_DATA_VOLUME || 'voting_performance_mongo_data';
export const configVolume = process.env.INTEGRATION_CONFIG_VOLUME || 'voting_performance_mongo_config';
export const composeNetwork = process.env.INTEGRATION_NETWORK_NAME || 'voting-performance-test-network';

export function validateRunDatabase(uri, databaseName, runId) {
  if (!/^[a-f0-9]{16,32}$/.test(runId || '')) throw new Error('TEST_RUN_ID must be a unique 16–32 character lowercase hex ID.');
  if (databaseName !== `voting_performance_test_${runId}` && databaseName !== `voting_integration_test_${runId}`) throw new Error('TEST_DB_NAME must match the run ID using the performance-test or integration-test prefix.');
  const parsed = new URL(uri);
  if (parsed.protocol !== 'mongodb:' || parsed.hostname !== 'mongo-performance') throw new Error('Database host must be the isolated Compose MongoDB service.');
  if (parsed.pathname.slice(1) !== databaseName) throw new Error('MongoDB URI database name does not match TEST_DB_NAME.');
  if (parsed.searchParams.get('replicaSet') !== 'rs0') throw new Error('MongoDB test database must use the dedicated rs0 replica set.');
  return databaseName;
}
