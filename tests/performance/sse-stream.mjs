import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

const here = path.dirname(fileURLToPath(import.meta.url));
const baseUrl = process.env.BASE_URL || '';
const runId = process.env.TEST_RUN_ID || '';
const database = process.env.TEST_DB_NAME || '';
const project = process.env.INTEGRATION_COMPOSE_PROJECT || '';
const vus = Number(process.env.SSE_VUS || 5);
const maxConnections = Number(process.env.SSE_MAX_CONNECTIONS || 100);
const expectLimit = process.env.SSE_EXPECT_LIMIT === 'true';
const heartbeatsRequired = Number(process.env.SSE_HEARTBEATS || 1);
const timeoutMs = parseDuration(process.env.SSE_TIMEOUT || '45s');
const heartbeatIntervalMs = Number(process.env.SSE_HEARTBEAT_INTERVAL_MS || 25000);
const expectedSuccesses = expectLimit ? Math.min(vus, maxConnections) : vus;
const summaryPath = process.env.SSE_SUMMARY_PATH || path.join(here, '.test-data', `sse-summary-${runId}.json`);

const result = {
  requestedConnections: vus,
  establishedConnections: 0,
  successfulStreams: 0,
  receivedEvents: 0,
  receivedHeartbeats: 0,
  unexpectedDisconnects: 0,
  timeouts: 0,
  serverErrors: 0,
  cleanupSuccesses: 0,
  capResponsesCorrect: 0,
  statusBreakdown: {},
  connectionEstablishmentMs: [],
  connectionDurationMs: [],
  checkPasses: 0,
  checkCount: 0,
  failures: [],
};

await verifyTarget();
validateConfig();

const runStarted = performance.now();
const loadResults = await Promise.all(Array.from({ length: vus }, (_, index) => runConnection(index + 1, 'load')));
const loadCompletedAt = performance.now();
const establishedLoadStreams = loadResults.filter((item) => item.established && item.connectedEvent && item.heartbeats >= heartbeatsRequired && item.cleanClose).length;

// A second real connection after all clients close confirms the backend
// released capacity, including after an explicit connection-limit test.
const capacityProbe = await runConnection(0, 'capacity_probe');
const totalDurationSeconds = (performance.now() - runStarted) / 1000;

const expectedLoadFailures = loadResults.every((item) => item.expected);
const smokePassed =
  result.establishedConnections >= expectedSuccesses &&
  result.capResponsesCorrect === Math.max(0, vus - maxConnections) &&
  establishedLoadStreams === expectedSuccesses &&
  expectedLoadFailures &&
  capacityProbe.expected &&
  result.unexpectedDisconnects === 0 &&
  result.timeouts === 0 &&
  result.serverErrors === 0 &&
  result.checkCount > 0 && result.checkPasses === result.checkCount;

const summary = {
  test: 'incremental-sse-stream',
  status: smokePassed ? 'PASS' : 'FAIL',
  target: { baseUrl, runId, database, project },
  configuration: { requestedConnections: vus, configuredLimit: maxConnections, expectLimit, heartbeatsRequired, timeoutMs, heartbeatIntervalMs },
  metrics: {
    ...result,
    connectionEstablishmentMs: distribution(result.connectionEstablishmentMs),
    connectionDurationMs: distribution(result.connectionDurationMs),
    checkPassRate: result.checkCount ? result.checkPasses / result.checkCount : 0,
    requestsPerSecond: result.requestedConnections / totalDurationSeconds,
    scheduledConnectionPhaseSeconds: (loadCompletedAt - runStarted) / 1000,
    elapsedSeconds: totalDurationSeconds,
    capacityProbe: {
      status: capacityProbe.status,
      established: capacityProbe.established,
      connectedEvent: capacityProbe.connectedEvent,
      heartbeats: capacityProbe.heartbeats,
      cleanClose: capacityProbe.cleanClose,
      latencyMs: capacityProbe.latencyMs,
    },
    establishedLoadStreams,
  },
};

await mkdir(path.dirname(summaryPath), { recursive: true });
await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, { mode: 0o600 });
console.log(JSON.stringify(summary, null, 2));
if (!smokePassed) process.exitCode = 1;

async function runConnection(index, kind) {
  const isLoad = kind === 'load';
  const startedAt = performance.now();
  const controller = new AbortController();
  let timedOut = false;
  let response;
  let reader;
  let connectedEvent = false;
  let heartbeatCount = 0;
  let deliberateClose = false;
  let cleanClose = false;
  let status = 0;
  let latencyMs = 0;
  let contentTypeCorrect = false;
  let capBodyCorrect = false;
  let networkError = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new Error('SSE stream timeout'));
  }, timeoutMs);

  try {
    response = await fetch(`${baseUrl}/api/sendvote`, {
      method: 'GET',
      headers: { Accept: 'text/event-stream' },
      signal: controller.signal,
    });
    status = response.status;
    latencyMs = performance.now() - startedAt;
    if (isLoad) {
      result.statusBreakdown[status] = (result.statusBreakdown[status] || 0) + 1;
      result.connectionEstablishmentMs.push(latencyMs);
    }

    if (status >= 500 && status !== 503) result.serverErrors += 1;
    if (status === 503) {
      let body;
      try { body = await response.json(); } catch { body = null; }
      capBodyCorrect = body?.message === 'SSE connection limit reached';
      if (capBodyCorrect && isLoad) result.capResponsesCorrect += 1;
      const expected = isLoad && expectLimit && capBodyCorrect;
      recordChecks([
        [expectLimit && capBodyCorrect, 'connection limit returns 503 with the expected message'],
        [expected, 'connection-cap behavior matches the requested test'],
      ], index, kind);
      return { kind, status, established: false, connectedEvent, heartbeats: 0, cleanClose: capBodyCorrect, expected, latencyMs };
    }

    const contentType = response.headers.get('content-type') || '';
    contentTypeCorrect = status === 200 && contentType.toLowerCase().includes('text/event-stream');
    if (!contentTypeCorrect) {
      const expected = false;
      recordChecks([[false, `expected HTTP 200 text/event-stream, received status ${status}`]], index, kind);
      return { kind, status, established: false, connectedEvent, heartbeats: 0, cleanClose: false, expected, latencyMs };
    }

    if (isLoad) result.establishedConnections += 1;
    if (!response.body) throw new Error('SSE response has no readable body');
    reader = response.body.getReader();
    const decoder = new TextDecoder();
    let pending = '';
    let dataLines = [];
    let commentLines = [];

    const processLine = (line) => {
      if (line.endsWith('\r')) line = line.slice(0, -1);
      if (line === '') {
        if (dataLines.length || commentLines.length) {
          if (isLoad) result.receivedEvents += 1;
          const data = dataLines.join('\n');
          const comments = commentLines.join('\n');
          if (!connectedEvent) {
            try { connectedEvent = JSON.parse(data).connected === true; } catch { connectedEvent = false; }
          } else if (comments.split('\n').some((comment) => comment.trim() === 'heartbeat')) {
            heartbeatCount += 1;
            if (isLoad) result.receivedHeartbeats += 1;
            if (heartbeatCount >= heartbeatsRequired) deliberateClose = true;
          }
        }
        dataLines = [];
        commentLines = [];
      } else if (line.startsWith(':')) {
        commentLines.push(line.slice(1).replace(/^ /, ''));
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).replace(/^ /, ''));
      }
    };

    while (!deliberateClose) {
      const { value, done } = await reader.read();
      if (done) break;
      pending += decoder.decode(value, { stream: true });
      let newline;
      while ((newline = pending.indexOf('\n')) >= 0) {
        processLine(pending.slice(0, newline));
        pending = pending.slice(newline + 1);
        if (deliberateClose) break;
      }
    }

    if (!deliberateClose) {
      if (isLoad) result.unexpectedDisconnects += 1;
    }
  } catch (error) {
    networkError = true;
    if (timedOut) result.timeouts += 1;
    else if (response?.status === 200 && isLoad && !deliberateClose) result.unexpectedDisconnects += 1;
  } finally {
    clearTimeout(timer);
    if (reader) {
      try {
        await reader.cancel();
        cleanClose = true;
      } catch {
        cleanClose = false;
      }
    }
    controller.abort();
  }

  const durationMs = performance.now() - startedAt;
  const established = status === 200 && contentTypeCorrect;
  const expected = established && connectedEvent && heartbeatCount >= heartbeatsRequired && deliberateClose && cleanClose && !timedOut && !networkError;
  if (isLoad) {
    result.connectionDurationMs.push(durationMs);
    if (expected) result.successfulStreams += 1;
    if (cleanClose) result.cleanupSuccesses += 1;
  }
  recordChecks([
    [established, 'HTTP 200 and correct SSE content type'],
    [connectedEvent, 'initial connected event received'],
    [heartbeatCount >= heartbeatsRequired && deliberateClose, 'heartbeat received while the stream remained open'],
    [cleanClose && !timedOut && !networkError, 'stream closed cleanly after client cancellation'],
    [expected, 'connection streamed and cleaned up successfully'],
  ], index, kind);
  return { kind, status, established, connectedEvent, heartbeats: heartbeatCount, cleanClose, expected, latencyMs };
}

function recordChecks(checks, index, kind) {
  for (const [passed, label] of checks) {
    result.checkCount += 1;
    if (passed) result.checkPasses += 1;
    else result.failures.push(`${kind} ${index}: ${label}`);
  }
}

async function verifyTarget() {
  const receiptPath = process.env.TARGET_RECEIPT;
  if (!receiptPath) throw new Error('TARGET_RECEIPT is required; run performance preflight first.');
  let receipt;
  try { receipt = JSON.parse(await readFile(receiptPath, 'utf8')); } catch { throw new Error('Target receipt is missing or unreadable.'); }
  const ageMs = Date.now() - Date.parse(receipt.checkedAt);
  const checks = {
    receiptFresh: ageMs >= 0 && ageMs <= 10 * 60 * 1000,
    baseUrlMatches: receipt.baseUrl === baseUrl && /^http:\/\/127\.0\.0\.1:\d+$/.test(baseUrl),
    runIdMatches: receipt.runId === runId && /^[a-f0-9]{16,32}$/.test(runId),
    databaseMatches: receipt.database === database && [ `voting_performance_test_${runId}`, `voting_integration_test_${runId}` ].includes(database),
    projectMatches: receipt.project === project && project === 'voting-performance-test',
  };
  if (Object.values(checks).some((ok) => !ok)) throw new Error(`Test target verification failed: ${JSON.stringify(checks)}`);
}

function validateConfig() {
  if (!Number.isInteger(vus) || vus < 1 || !Number.isInteger(maxConnections) || maxConnections < 1) throw new Error('SSE_VUS and SSE_MAX_CONNECTIONS must be positive integers.');
  if (!Number.isInteger(heartbeatsRequired) || heartbeatsRequired < 1) throw new Error('SSE_HEARTBEATS must be a positive integer.');
  if (!expectLimit && vus > maxConnections) throw new Error('SSE_VUS exceeds the configured cap; set SSE_EXPECT_LIMIT=true for an explicit cap test.');
  if (!Number.isFinite(timeoutMs) || timeoutMs <= heartbeatIntervalMs * heartbeatsRequired + 5000) throw new Error('SSE_TIMEOUT must exceed the requested heartbeat duration by at least 5 seconds.');
}

function parseDuration(value) {
  const match = /^([0-9]+(?:\.[0-9]+)?)(ms|s|m)$/.exec(value);
  if (!match) return NaN;
  const amount = Number(match[1]);
  return amount * ({ ms: 1, s: 1000, m: 60000 }[match[2]]);
}

function distribution(values) {
  if (!values.length) return { count: 0, p50: null, p90: null, p95: null, p99: null, max: null };
  const sorted = values.slice().sort((a, b) => a - b);
  const pick = (p) => sorted[Math.ceil(p * sorted.length) - 1];
  return { count: sorted.length, p50: pick(0.5), p90: pick(0.9), p95: pick(0.95), p99: pick(0.99), max: sorted.at(-1) };
}
