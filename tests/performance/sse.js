import sse from 'k6/x/sse';
import { check, fail } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { baseUrl, requireTestTarget } from './helpers.js';

const vus = Number(__ENV.SSE_VUS || 5);
const maxConnections = Number(__ENV.SSE_MAX_CONNECTIONS || 100);
const expectLimit = __ENV.SSE_EXPECT_LIMIT === 'true';
const heartbeatsRequired = Number(__ENV.SSE_HEARTBEATS || 1);
const expectedSuccesses = expectLimit ? Math.min(vus, maxConnections) : vus;

const requestedConnections = new Counter('sse_connections_requested');
const establishedConnections = new Counter('sse_connections_established');
const receivedEvents = new Counter('sse_events_received');
const heartbeatEvents = new Counter('sse_heartbeats_received');
const unexpectedDisconnects = new Counter('sse_unexpected_disconnects');
const connectionTimeouts = new Counter('sse_connection_timeouts');
const serverErrors = new Counter('sse_server_errors');
const cleanupSuccess = new Rate('sse_cleanup_success');
const streamSuccess = new Rate('sse_stream_success');
const connectionLatency = new Trend('sse_connection_establishment_ms', true);
const connectionDuration = new Trend('sse_connection_duration_ms', true);

export const options = {
  scenarios: {
    sse_connections: {
      executor: 'per-vu-iterations',
      vus,
      iterations: 1,
      maxDuration: __ENV.SSE_MAX_DURATION || '2m',
    },
  },
  thresholds: {
    checks: ['rate>0.99'],
    sse_connections_requested: [`count==${vus}`],
    sse_connections_established: [`count==${expectedSuccesses}`],
    sse_events_received: [`count>=${expectedSuccesses * (1 + heartbeatsRequired)}`],
    sse_cleanup_success: ['rate>0.99'],
    sse_stream_success: [`rate>=${(expectedSuccesses / vus).toFixed(4)}`],
    sse_unexpected_disconnects: ['count==0'],
    sse_connection_timeouts: ['count==0'],
    sse_server_errors: ['count==0'],
  },
};

export function setup() {
  requireTestTarget();
  if (!Number.isInteger(vus) || vus < 1 || !Number.isInteger(maxConnections) || maxConnections < 1) {
    fail('SSE_VUS and SSE_MAX_CONNECTIONS must be positive integers.');
  }
  if (!Number.isInteger(heartbeatsRequired) || heartbeatsRequired < 1) {
    fail('SSE_HEARTBEATS must be a positive integer.');
  }
  if (!expectLimit && vus > maxConnections) {
    fail('SSE_VUS exceeds SSE_MAX_CONNECTIONS; set SSE_EXPECT_LIMIT=true for an explicit cap test.');
  }
}

export default function () {
  requestedConnections.add(1);
  const startedAt = Date.now();
  let openedAt = 0;
  let connectedEventReceived = false;
  let heartbeatCount = 0;
  let streamError = false;
  let deliberateClose = false;
  let client;

  const response = sse.open(`${baseUrl}/api/sendvote`, {
    timeout: __ENV.SSE_TIMEOUT || '45s',
  }, (stream) => {
    client = stream;
    stream.on('open', () => {
      openedAt = Date.now();
      connectionLatency.add(openedAt - startedAt);
    });
    stream.on('event', (event) => {
      receivedEvents.add(1);
      if (!connectedEventReceived) {
        try {
          connectedEventReceived = JSON.parse(event.data).connected === true;
        } catch (_) {
          connectedEventReceived = false;
        }
        return;
      }

      // Heartbeat comments are parsed as SSE events by xk6-sse. Closing from
      // this callback keeps the socket open until the server actually streams.
      if (event.comment === 'heartbeat' || event.Comment === 'heartbeat') {
        heartbeatCount += 1;
        heartbeatEvents.add(1);
        if (heartbeatCount >= heartbeatsRequired) {
          deliberateClose = true;
          stream.close();
        }
      }
    });
    stream.on('error', (error) => {
      streamError = true;
      const message = String(error?.error?.() || error?.message || error || '');
      if (/timeout|deadline/i.test(message)) connectionTimeouts.add(1);
    });
  });

  const duration = Date.now() - (openedAt || startedAt);
  connectionDuration.add(duration);
  const contentType = response?.headers?.['Content-Type'] || response?.headers?.['content-type'] || '';
  const established = response?.status === 200 && contentType.toLowerCase().includes('text/event-stream');
  if (established) establishedConnections.add(1);
  if (response?.status >= 500) serverErrors.add(1);

  // A non-200 cap response is an expected result only in the explicit limit
  // test. A 200 counts only after the initial event and streamed heartbeat(s).
  const limitedCorrectly = expectLimit && response?.status === 503;
  const streamCompleted = established && connectedEventReceived && heartbeatCount >= heartbeatsRequired && deliberateClose;
  const expectedOutcome = limitedCorrectly || streamCompleted;
  const clean = limitedCorrectly || (streamCompleted && !streamError);
  if (established && !deliberateClose) unexpectedDisconnects.add(1);

  cleanupSuccess.add(clean);
  streamSuccess.add(streamCompleted);
  check(response, {
    'SSE returned expected status and content type': () => limitedCorrectly || established,
    'SSE delivered initial connected event': () => limitedCorrectly || connectedEventReceived,
    'SSE delivered heartbeat while connection stayed open': () => limitedCorrectly || heartbeatCount >= heartbeatsRequired,
    'SSE connection closed cleanly after streamed event': () => clean,
    'SSE attempt completed as expected': () => expectedOutcome,
  });
}
