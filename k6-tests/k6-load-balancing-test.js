import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

const successfulRequests = new Counter('successful_requests');
const failedRequests = new Counter('failed_requests');
const successRate = new Rate('success_rate');
const requestDuration = new Trend('request_duration');

const voterCodes = JSON.parse(open('./voter-codes.json')).codes;

export const options = {
  scenarios: {
    // Start small and gradually increase
    gradual_load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 10 },   // Ramp to 10 users
        { duration: '1m', target: 10 },    // Hold at 10
        { duration: '30s', target: 25 },   // Increase to 25
        { duration: '1m', target: 25 },    // Hold at 25
        { duration: '30s', target: 50 },   // Increase to 50
        { duration: '1m', target: 50 },    // Hold at 50
        { duration: '30s', target: 75 },   // Increase to 75
        { duration: '1m', target: 75 },    // Hold at 75
        { duration: '30s', target: 100 },  // Increase to 100
        { duration: '1m', target: 100 },   // Hold at 100
        { duration: '30s', target: 0 },    // Ramp down
      ],
    },
  },
  
  thresholds: {
    http_req_duration: ['p(95)<2000', 'p(99)<3000'],
    http_req_failed: ['rate<0.10'],
    success_rate: ['rate>0.90'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export function setup() {
  const res = http.get(`${BASE_URL}/api/currentteam`);
  if (res.status !== 200 || !res.json().teamID) {
    throw new Error('No team presenting. Set team via admin panel.');
  }
  const data = res.json();
  console.log(`Load Balancing Test: ${data.teamName} (10→100 users)`);
  return { teamID: data.teamID, teamName: data.teamName };
}

export default function(data) {
  const codeIndex = (__VU * 1000 + __ITER) % voterCodes.length;
  const voterCode = voterCodes[codeIndex];
  
  const registerStart = Date.now();
  const registerRes = http.post(
    `${BASE_URL}/api/register`,
    JSON.stringify({ code: voterCode }),
    { headers: { 'Content-Type': 'application/json' }, tags: { name: 'register' } }
  );
  
  requestDuration.add(Date.now() - registerStart);
  
  const registerCheck = check(registerRes, {
    'registration status 200': (r) => r.status === 200 || r.status === 201,
    'registration has cookie': (r) => r.cookies.connectionCookie !== undefined,
  });
  
  if (!registerCheck) {
    failedRequests.add(1);
    successRate.add(false);
    return;
  }
  
  successfulRequests.add(1);
  const cookie = registerRes.cookies.connectionCookie[0].value;
  sleep(0.5 + Math.random() * 1.5);
  
  const voteChoice = Math.random() > 0.5 ? 'yes' : 'no';
  const voteStart = Date.now();
  
  const voteRes = http.post(
    `${BASE_URL}/api/vote/${data.teamID}`,
    JSON.stringify({ vote: voteChoice }),
    {
      headers: { 
        'Content-Type': 'application/json',
        'Cookie': `connectionCookie=${cookie}`,
      },
      tags: { name: 'vote', vote_type: voteChoice },
    }
  );
  
  requestDuration.add(Date.now() - voteStart);
  
  const voteCheck = check(voteRes, {
    'vote status 200': (r) => r.status === 200,
    'vote recorded': (r) => {
      try { return r.json('voted') === true; }
      catch (e) { return false; }
    },
  });
  
  if (voteCheck) {
    successfulRequests.add(1);
    successRate.add(true);
  } else {
    failedRequests.add(1);
    successRate.add(false);
  }
  
  sleep(1);
}

export function teardown(data) {
  console.log(`Test completed: ${data.teamName}`);
  console.log('Run verify-load-balancing.sh on VPS to check distribution');
}

