import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { allowedBaseUrl, composeProject, composeNetwork, configVolume, databaseVolume, validateRunDatabase } from './test-target.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const envFile = process.env.PERFORMANCE_ENV_FILE ? path.resolve(process.env.PERFORMANCE_ENV_FILE) : path.join(here, '.env.performance');
const composeFile = path.join(here, 'docker-compose.test.yml');
const dockerIgnore = readFileSync(path.join(here, 'Dockerfile.dockerignore'), 'utf8');
for (const protectedPath of ['**/.env', '**/.env.*', 'server/private', 'tests']) {
  if (!dockerIgnore.split(/\r?\n/).some(line => line.trim() === protectedPath)) throw new Error(`Test Docker build context must exclude ${protectedPath}.`);
}
const env = {
  ...parseEnv(readFileSync(envFile, 'utf8')),
  ...process.env,
};
const expectedGitRevision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: path.resolve(here, '../..'), encoding: 'utf8' }).trim();
if (!/^[a-f0-9]{40}$/.test(expectedGitRevision)) throw new Error('Unable to determine the expected full Git revision.');
const dirtyServerSource = execFileSync('git', ['status', '--porcelain', '--', 'server/src'], { cwd: path.resolve(here, '../..'), encoding: 'utf8' }).trim();
if (dirtyServerSource) throw new Error('Commit or discard server/src changes before building so the image revision label identifies the source it contains.');
const { TEST_RUN_ID: runId, TEST_DB_NAME: database } = env;
const expectedUri = `mongodb://mongo-performance:27017/${database}?replicaSet=rs0`;
validateRunDatabase(expectedUri, database, runId);
for (const key of ['SESSION_SECRET', 'VOTER_CODE_PEPPER', 'JWT_SECRET', 'ADMIN_PASSWORD']) {
  if (!env[key] || env[key].length < 32 || /replace-with|placeholder/i.test(env[key])) throw new Error(`${key} must be a unique local test secret of at least 32 characters.`);
}
const voterFile = path.resolve(here, env.TEST_VOTER_CODES_FILE || '');
if (path.dirname(voterFile) !== path.join(here, '.test-data') || path.extname(voterFile) !== '.json') throw new Error('TEST_VOTER_CODES_FILE must be a JSON file directly inside tests/performance/.test-data.');
const codes = JSON.parse(readFileSync(voterFile, 'utf8'));
if (!Array.isArray(codes) || !codes.length || codes.some(c => typeof c !== 'string' || !/^[A-Za-z0-9]{9}$/.test(c)) || new Set(codes).size !== codes.length) throw new Error('Private voter-code fixture must contain unique 9-character test codes.');
const root = path.resolve(here, '../..');
const realCodeFile = path.join(root, 'server', 'private', 'voter-codes.json');
try {
  const realCodes = JSON.parse(readFileSync(realCodeFile, 'utf8'));
  if (realCodes.some(code => codes.includes(code))) throw new Error('Test voter codes overlap server/private/voter-codes.json; use a dedicated test-only code set.');
} catch (error) {
  if (error.message.includes('overlap')) throw error;
  if (error.code !== 'ENOENT') throw new Error('Unable to verify test code separation from the application voter-code file.');
}
const backendEnvFile = path.join(root, 'server', '.env');
try {
  const backendEnv = parseEnv(readFileSync(backendEnvFile, 'utf8'));
  for (const key of ['SESSION_SECRET', 'VOTER_CODE_PEPPER', 'JWT_SECRET', 'ADMIN_PASSWORD', 'ADMIN_SECRET_KEY']) {
    if (env[key] && backendEnv[key] && env[key] === backendEnv[key]) throw new Error(`${key} must not reuse the normal backend configuration.`);
  }
} catch (error) {
  if (error.message.includes('must not reuse')) throw error;
  if (error.code !== 'ENOENT') throw new Error('Unable to verify test secrets are separate from server/.env.');
}

const configText = docker(['compose', '--env-file', envFile, '-f', composeFile, 'config', '--format', 'json']);
const config = JSON.parse(configText);
if (config.name !== composeProject) throw new Error('Compose project name does not match the configured isolated test project.');
const backend = config.services?.backend;
const mongo = config.services?.['mongo-performance'];
if (!backend || !mongo) throw new Error('Dedicated performance backend or Mongo service is missing.');
if (backend.build?.args?.SOURCE_REVISION !== expectedGitRevision) throw new Error('Compose image build revision does not match the checked-out Git revision.');
if (backend.environment?.MONGO_URI !== expectedUri || backend.environment?.TEST_DB_NAME !== database) throw new Error('Resolved backend MongoDB URI is not the unique allowlisted test database.');
const expectedApiPort = process.env.API_PORT || '3180';
if (!backend.ports?.some(p => String(p.host_ip) === '127.0.0.1' && String(p.published) === expectedApiPort && Number(p.target) === 3000)) throw new Error(`Test API must be published only on 127.0.0.1:${expectedApiPort}.`);
if (backend.environment?.NODE_ENV !== 'development' || backend.environment?.ADMIN_SECRET_KEY !== '' || backend.environment?.ADMIN_KEYS !== '') throw new Error('Dedicated backend environment is missing safe test overrides.');
for (const key of ['SESSION_SECRET', 'VOTER_CODE_PEPPER', 'JWT_SECRET', 'ADMIN_USERNAME', 'ADMIN_PASSWORD']) if (backend.environment?.[key] !== env[key]) throw new Error(`Resolved Compose ${key} differs from the private test config.`);
if (config.volumes?.performance_mongo_data?.name !== databaseVolume || config.volumes?.performance_mongo_config?.name !== configVolume || !mongo.volumes?.some(v => v.type === 'volume' && v.source === 'performance_mongo_data' && v.target === '/data/db') || !mongo.volumes?.some(v => v.type === 'volume' && v.source === 'performance_mongo_config' && v.target === '/data/configdb')) throw new Error('Dedicated Mongo data/config volumes are not attached.');
if (!config.networks?.performance || config.networks.performance.name !== composeNetwork) throw new Error('Dedicated integration network name does not match the configured isolated network.');

const backendId = docker(['compose', '--env-file', envFile, '-f', composeFile, 'ps', '-q', 'backend']).trim();
const mongoId = docker(['compose', '--env-file', envFile, '-f', composeFile, 'ps', '-q', 'mongo-performance']).trim();
if (!backendId || !mongoId) throw new Error('Start the dedicated Compose backend and Mongo services before preflight.');
const backendInspect = JSON.parse(docker(['inspect', backendId]))[0];
const mongoInspect = JSON.parse(docker(['inspect', mongoId]))[0];
if (!backendInspect.State?.Running || !mongoInspect.State?.Running) throw new Error('Dedicated Compose containers must be running.');
if (backendInspect.Config?.Labels?.['com.docker.compose.project'] !== composeProject || mongoInspect.Config?.Labels?.['com.docker.compose.project'] !== composeProject) throw new Error('Running containers do not belong to the allowlisted Compose project.');
const runtimeEnv = Object.fromEntries((backendInspect.Config.Env || []).map(x => [x.slice(0, x.indexOf('=')), x.slice(x.indexOf('=') + 1)]));
const imageInspect = JSON.parse(docker(['image', 'inspect', backendInspect.Image]))[0];
const imageRevision = imageInspect.Config?.Labels?.['org.opencontainers.image.revision'];
if (!imageRevision || imageRevision !== expectedGitRevision || runtimeEnv.EXPECTED_SOURCE_REVISION !== expectedGitRevision) {
  throw new Error('Running backend image label/runtime revision does not match the checked-out Git revision.');
}
if (runtimeEnv.MONGO_URI !== expectedUri || runtimeEnv.TEST_DB_NAME !== database || runtimeEnv.SESSION_SECRET !== env.SESSION_SECRET || runtimeEnv.VOTER_CODE_PEPPER !== env.VOTER_CODE_PEPPER || runtimeEnv.JWT_SECRET !== env.JWT_SECRET || runtimeEnv.ADMIN_USERNAME !== env.ADMIN_USERNAME || runtimeEnv.ADMIN_PASSWORD !== env.ADMIN_PASSWORD) throw new Error('Running backend configuration does not match the verified test database/secrets.');
if (!mongoInspect.Mounts?.some(m => m.Type === 'volume' && m.Name === databaseVolume && m.Destination === '/data/db') || !mongoInspect.Mounts?.some(m => m.Type === 'volume' && m.Name === configVolume && m.Destination === '/data/configdb')) throw new Error('Running Mongo container is not using the dedicated isolated volumes.');
const liveDb = JSON.parse(docker(['compose', '--env-file', envFile, '-f', composeFile, 'exec', '-T', 'backend', 'node', '/perf/check-target.mjs']).trim());
if (liveDb.database !== database || liveDb.host !== 'mongo-performance' || liveDb.runId !== runId) throw new Error('Live MongoDB connection identity check failed.');

const receipt = { project: composeProject, baseUrl: allowedBaseUrl, runId, database, backendId, mongoId, checkedAt: new Date().toISOString() };
const privateDir = path.join(here, '.test-data');
mkdirSync(privateDir, { recursive: true });
writeFileSync(path.join(privateDir, `target-${runId}.json`), JSON.stringify(receipt, null, 2), { mode: 0o600 });
console.log(JSON.stringify({ result: 'PASS', project: composeProject, baseUrl: allowedBaseUrl, database, voterCodesAvailable: codes.length, checkedAt: receipt.checkedAt }));

function docker(args) {
  try { return execFileSync('docker', args, { cwd: here, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (error) { throw new Error(`Docker preflight command failed (${args.slice(0, 3).join(' ')}); verify Docker Desktop and the dedicated test Compose stack.`); }
}
function parseEnv(text) {
  const result = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const equals = trimmed.indexOf('=');
    if (equals < 1) continue;
    result[trimmed.slice(0, equals).trim()] = trimmed.slice(equals + 1).trim().replace(/^(['"])(.*)\1$/, '$2');
  }
  return result;
}
