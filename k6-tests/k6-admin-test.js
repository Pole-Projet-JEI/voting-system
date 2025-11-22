import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend, Rate } from 'k6/metrics';

const adminOperations = new Counter('admin_operations');
const teamUpdates = new Trend('team_update_duration');
const adminSuccessRate = new Rate('admin_success_rate');

export const options = {
  scenarios: {
    admin_load: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: [
        { duration: '30s', target: 5 },   // Ramp to 5 admin users
        { duration: '2m', target: 5 },    // Hold
        { duration: '30s', target: 10 },  // Increase to 10
        { duration: '2m', target: 10 },   // Hold
        { duration: '30s', target: 0 },   // Ramp down
      ],
    },
  },
  
  thresholds: {
    http_req_duration: ['p(95)<3000'],
    http_req_failed: ['rate<0.01'], // Less than 1% errors
    admin_success_rate: ['rate>0.99'], // 99% success for admin ops
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const ADMIN_KEY = __ENV.ADMIN_KEY;

export function setup() {
  if (!ADMIN_KEY) {
    throw new Error('ADMIN_KEY required. Use: k6 run --env ADMIN_KEY=your_key k6-admin-test.js');
  }
  
  const loginRes = http.post(
    `${BASE_URL}/api/admin/login`,
    JSON.stringify({ secretKey: ADMIN_KEY }),
    { headers: { 'Content-Type': 'application/json' } }
  );
  
  if (loginRes.status !== 200 || !loginRes.cookies.adminToken) {
    throw new Error(`Admin login failed: ${loginRes.status}`);
  }
  
  console.log(`Admin Operations Test: ${BASE_URL}`);
  return { adminCookie: loginRes.cookies.adminToken[0].value };
}

export default function(data) {
  const headers = {
    'Content-Type': 'application/json',
    'Cookie': `adminToken=${data.adminCookie}`,
  };
  
  // === 1. Get all teams ===
  const teamsRes = http.get(`${BASE_URL}/api/admin/teams`, { 
    headers,
    tags: { name: 'admin_get_teams' },
  });
  
  const teamsCheck = check(teamsRes, {
    'get teams success': (r) => r.status === 200,
    'teams is array': (r) => {
      try {
        const data = r.json();
        return Array.isArray(data.teams);
      } catch (e) {
        return false;
      }
    },
  });
  
  if (teamsCheck) {
    adminOperations.add(1);
    adminSuccessRate.add(true);
  } else {
    adminSuccessRate.add(false);
  }
  
  sleep(2);
  
  // === 2. Get presenting team ===
  const presentingRes = http.get(`${BASE_URL}/api/admin/presenting`, {
    headers,
    tags: { name: 'admin_get_presenting' },
  });
  
  const presentingCheck = check(presentingRes, {
    'get presenting success': (r) => r.status === 200,
  });
  
  if (presentingCheck) {
    adminOperations.add(1);
    adminSuccessRate.add(true);
  } else {
    adminSuccessRate.add(false);
  }
  
  sleep(3);
  
  // === 3. Check visualization stats ===
  const statsRes = http.get(`${BASE_URL}/api/admin/stats`, {
    headers,
    tags: { name: 'admin_get_stats' },
  });
  
  check(statsRes, {
    'get stats success': (r) => r.status === 200,
  });
  
  adminOperations.add(1);
  
  sleep(5);
}

export function teardown(data) {
  const headers = {
    'Content-Type': 'application/json',
    'Cookie': `adminToken=${data.adminCookie}`,
  };
  http.post(`${BASE_URL}/api/admin/logout`, null, { headers });
  console.log('Admin test completed');
}

