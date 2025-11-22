import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import { Counter, Rate, Trend } from 'k6/metrics';

// Load voter codes once
const voterCodes = new SharedArray('codes', function() {
  return JSON.parse(open('./voter-codes.json')).codes;
});

// Custom metrics
const totalRequests = new Counter('total_requests');
const voterRequests = new Counter('voter_requests');
const sseConnections = new Counter('sse_connections');
const adminRequests = new Counter('admin_requests');
const overallSuccessRate = new Rate('overall_success_rate');

export const options = {
  scenarios: {
    // 70% - Voter flow (register + vote)
    voters: {
      executor: 'ramping-arrival-rate',
      startRate: 10,
      timeUnit: '1s',
      preAllocatedVUs: 50,
      maxVUs: 300,
      stages: [
        { duration: '1m', target: 30 },   // 30 req/s
        { duration: '3m', target: 50 },   // 50 req/s
        { duration: '2m', target: 100 },  // 100 req/s (peak)
        { duration: '2m', target: 50 },   // Scale down
        { duration: '1m', target: 20 },   // Low load
        { duration: '1m', target: 0 },    // End
      ],
      exec: 'voterFlow',
    },
    
    // 20% - SSE connections (real-time updates)
    sse: {
      executor: 'constant-vus',
      vus: 50,
      duration: '10m',
      exec: 'sseConnection',
    },
    
    // 10% - Admin operations
    admin: {
      executor: 'constant-vus',
      vus: 5,
      duration: '10m',
      exec: 'adminFlow',
    },
  },
  
  thresholds: {
    'http_req_duration{name:register}': ['p(95)<1500'],
    'http_req_duration{name:vote}': ['p(95)<2000'],
    'http_req_duration{name:sse}': ['p(95)<1000'],
    'http_req_duration{name:admin_ops}': ['p(95)<3000'],
    http_req_failed: ['rate<0.05'], // Less than 5% overall errors
    overall_success_rate: ['rate>0.95'], // 95% overall success
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const ADMIN_KEY = __ENV.ADMIN_KEY || 'test-admin-key';

let globalTeamID = null;
let globalAdminCookie = null;

export function setup() {
  console.log(`Mixed Workload Test: 70% voters, 20% SSE, 10% admin`);
  
  const teamRes = http.get(`${BASE_URL}/api/currentteam`);
  if (teamRes.status === 200) {
    const data = teamRes.json();
    globalTeamID = data.teamID;
    console.log(`Team: ${data.teamName}`);
  }
  
  const loginRes = http.post(
    `${BASE_URL}/api/admin/login`,
    JSON.stringify({ secretKey: ADMIN_KEY }),
    { headers: { 'Content-Type': 'application/json' } }
  );
  
  if (loginRes.status === 200 && loginRes.cookies.adminToken) {
    globalAdminCookie = loginRes.cookies.adminToken[0].value;
  }
  
  return { teamID: globalTeamID, adminCookie: globalAdminCookie };
}

export function voterFlow(data) {
  if (!data.teamID) return;
  
  const code = voterCodes[Math.floor(Math.random() * voterCodes.length)];
  
  // Register
  const registerRes = http.post(
    `${BASE_URL}/api/register`,
    JSON.stringify({ code }),
    { 
      headers: { 'Content-Type': 'application/json' },
      tags: { name: 'register', flow: 'voter' }
    }
  );
  
  totalRequests.add(1);
  voterRequests.add(1);
  
  const registerSuccess = check(registerRes, {
    'register success': (r) => r.status === 200 || r.status === 201,
  });
  
  overallSuccessRate.add(registerSuccess);
  
  if (!registerSuccess || !registerRes.cookies.connectionCookie) {
    return;
  }
  
  const cookie = registerRes.cookies.connectionCookie[0].value;
  sleep(Math.random() * 2);
  
  // Vote
  const voteChoice = Math.random() > 0.5 ? 'yes' : 'no';
  const voteRes = http.post(
    `${BASE_URL}/api/vote/${data.teamID}`,
    JSON.stringify({ vote: voteChoice }),
    {
      headers: { 
        'Content-Type': 'application/json',
        'Cookie': `connectionCookie=${cookie}`,
      },
      tags: { name: 'vote', flow: 'voter', vote_type: voteChoice }
    }
  );
  
  totalRequests.add(1);
  voterRequests.add(1);
  
  const voteSuccess = check(voteRes, {
    'vote success': (r) => r.status === 200,
  });
  
  overallSuccessRate.add(voteSuccess);
  sleep(1);
}

export function sseConnection() {
  const res = http.get(`${BASE_URL}/api/sendvote`, {
    headers: {
      'Accept': 'text/event-stream',
      'Cache-Control': 'no-cache',
    },
    timeout: '30s',
    tags: { name: 'sse', flow: 'sse' },
  });
  
  totalRequests.add(1);
  
  const success = check(res, {
    'sse connected': (r) => r.status === 200,
  });
  
  if (success) {
    sseConnections.add(1);
  }
  
  overallSuccessRate.add(success);
  sleep(30);
}

export function adminFlow(data) {
  if (!data.adminCookie) return;
  
  const headers = {
    'Content-Type': 'application/json',
    'Cookie': `adminToken=${data.adminCookie}`,
  };
  
  // Get teams
  const teamsRes = http.get(`${BASE_URL}/api/admin/teams`, { 
    headers,
    tags: { name: 'admin_ops', flow: 'admin', operation: 'get_teams' }
  });
  
  totalRequests.add(1);
  adminRequests.add(1);
  
  const success = check(teamsRes, {
    'admin op success': (r) => r.status === 200,
  });
  
  overallSuccessRate.add(success);
  sleep(5);
  
  // Get presenting team
  const presentingRes = http.get(`${BASE_URL}/api/admin/presenting`, {
    headers,
    tags: { name: 'admin_ops', flow: 'admin', operation: 'get_presenting' }
  });
  
  totalRequests.add(1);
  adminRequests.add(1);
  overallSuccessRate.add(presentingRes.status === 200);
  
  sleep(10);
}

export function teardown(data) {
  if (data.adminCookie) {
    http.post(`${BASE_URL}/api/admin/logout`, null, {
      headers: { 'Cookie': `adminToken=${data.adminCookie}` }
    });
  }
  console.log('Mixed workload test completed');
}

