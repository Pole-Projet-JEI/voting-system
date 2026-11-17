import http from 'k6/http';
import { check, fail } from 'k6';
import { Counter, Rate } from 'k6/metrics';
import { baseUrl, requireTestTarget } from './helpers.js';

const vus = Number(__ENV.SSE_VUS || 5);
const maxConnections = Number(__ENV.SSE_MAX_CONNECTIONS || 100);
const expectLimit = __ENV.SSE_EXPECT_LIMIT === 'true';
const expectedSuccesses = expectLimit ? Math.min(vus, maxConnections) : vus;
const connectionSuccess = new Rate('sse_connection_success');
const establishedConnections = new Counter('sse_connections_established');
export const options = {
  scenarios: { sse_probe: { executor: 'per-vu-iterations', vus, iterations: 1, maxDuration: __ENV.SSE_MAX_DURATION || '2m' } },
  thresholds: {
    checks: ['rate>0.99'],
    sse_connection_success: [`rate>=${(expectedSuccesses / vus).toFixed(4)}`],
    sse_connections_established: [`count==${expectedSuccesses}`],
  },
};

export function setup() {
  requireTestTarget();
  if (!Number.isInteger(vus) || vus < 1 || !Number.isInteger(maxConnections) || maxConnections < 1) fail('SSE_VUS and SSE_MAX_CONNECTIONS must be positive integers.');
  if (!expectLimit && vus > maxConnections) fail('SSE_VUS exceeds configured SSE_MAX_CONNECTIONS; set SSE_EXPECT_LIMIT=true for an explicit limit test.');
}

export default function () {
  // Bounded connection probe only: synchronous k6 HTTP does not expose incremental SSE frames.
  http.setResponseCallback(null); // The expected stream timeout is not an HTTP failure signal for this probe.
  const response = http.get(`${baseUrl}/api/sendvote`, {
    timeout: __ENV.SSE_TIMEOUT || '35s',
    responseType: 'text',
    responseCallback: http.expectedStatuses(200, 503),
  });
  const established = response.status === 200 && String(response.headers['Content-Type'] || '').includes('text/event-stream');
  const limitedCorrectly = response.status === 503 && (() => { try { return response.json('message') === 'SSE connection limit reached'; } catch (_) { return false; } })();
  const expectedLimitResponse = expectLimit ? established || limitedCorrectly : established;
  check(response, { 'SSE connection attempt matches expected cap behavior': () => expectedLimitResponse });
  connectionSuccess.add(established);
  if (established) establishedConnections.add(1);
}
