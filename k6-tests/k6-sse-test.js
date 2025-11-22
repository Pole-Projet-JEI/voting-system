import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate } from 'k6/metrics';

const sseConnections = new Counter('sse_connections');
const sseErrors = new Counter('sse_errors');
const sseSuccessRate = new Rate('sse_success_rate');

export const options = {
  scenarios: {
    sse_load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 50 },   // Ramp to 50 SSE connections
        { duration: '2m', target: 50 },    // Hold
        { duration: '30s', target: 100 },  // Increase to 100
        { duration: '2m', target: 100 },   // Hold
        { duration: '30s', target: 150 },  // Increase to 150
        { duration: '2m', target: 150 },   // Hold
        { duration: '30s', target: 0 },    // Ramp down
      ],
    },
  },
  
  thresholds: {
    sse_errors: ['count<10'], // Less than 10 SSE errors
    sse_success_rate: ['rate>0.95'], // 95% success rate
    http_req_duration: ['p(95)<1000'], // Connection establishment under 1s
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export function setup() {
  console.log(`🚀 Starting SSE connection test against ${BASE_URL}`);
  console.log(`📡 Testing Server-Sent Events load balancing and stability`);
}

export default function() {
  const res = http.get(`${BASE_URL}/api/sendvote`, {
    headers: {
      'Accept': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
    timeout: '60s', // Keep connection open for 60s
    tags: { name: 'sse' },
  });
  
  const success = check(res, {
    'SSE connected': (r) => r.status === 200,
    'SSE content-type': (r) => r.headers['Content-Type'] && r.headers['Content-Type'].includes('text/event-stream'),
    'SSE has data': (r) => r.body && r.body.length > 0,
  });
  
  if (success) {
    sseConnections.add(1);
    sseSuccessRate.add(true);
  } else {
    sseErrors.add(1);
    sseSuccessRate.add(false);
    console.error(`❌ SSE connection failed: ${res.status}`);
  }
  
  // Small delay before reconnecting
  sleep(1);
}

export function teardown() {
  console.log(`\n✅ SSE test completed`);
  console.log(`📊 Total SSE connections established: check summary above`);
}

