import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

// Custom metrics
const voterRegistrationErrors = new Counter('voter_registration_errors');
const voteSubmissionErrors = new Counter('vote_submission_errors');
const successfulVotes = new Counter('successful_votes');
const voteSuccessRate = new Rate('vote_success_rate');
const registrationDuration = new Trend('registration_duration');
const voteDuration = new Trend('vote_duration');

// Load voter codes
const voterCodes = JSON.parse(open('./voter-codes.json')).codes;

export const options = {
  scenarios: {
    // Scenario 1: Gradual ramp-up (warm-up)
    warmup: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 50 },   // Ramp to 50 users
        { duration: '1m', target: 50 },    // Stay at 50
        { duration: '10s', target: 0 },    // Ramp down
      ],
      gracefulRampDown: '10s',
      startTime: '0s',
    },
    
    // Scenario 2: Spike test (sudden load)
    spike: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: 200 },  // Sudden spike
        { duration: '30s', target: 200 },  // Hold spike
        { duration: '10s', target: 0 },    // Drop
      ],
      gracefulRampDown: '10s',
      startTime: '2m',  // Start after warmup
    },
    
    // Scenario 3: Sustained load
    sustained: {
      executor: 'constant-vus',
      vus: 100,
      duration: '3m',
      startTime: '4m',  // Start after spike
    },
  },
  
  thresholds: {
    http_req_duration: ['p(95)<2000', 'p(99)<3000'], // 95% under 2s, 99% under 3s
    http_req_failed: ['rate<0.05'], // Less than 5% errors
    vote_success_rate: ['rate>0.95'], // 95% successful votes
    registration_duration: ['p(95)<1000'], // Registration under 1s
    vote_duration: ['p(95)<1500'], // Voting under 1.5s
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export function setup() {
  console.log(`🚀 Starting voter flow test against ${BASE_URL}`);
  
  // Get currently presenting team
  const res = http.get(`${BASE_URL}/api/currentteam`);
  
  if (res.status !== 200) {
    throw new Error(`Failed to get current team: ${res.status}`);
  }
  
  const data = res.json();
  
  if (!data.teamID) {
    throw new Error('No team is currently presenting. Please set a presenting team first.');
  }
  
  console.log(`✅ Testing with team: ${data.teamName} (${data.teamID})`);
  
  return {
    teamID: data.teamID,
    teamName: data.teamName,
  };
}

export default function(data) {
  const vuId = __VU;
  const iterationId = __ITER;
  
  // Get unique voter code for this VU
  const codeIndex = (vuId + iterationId * 1000) % voterCodes.length;
  const voterCode = voterCodes[codeIndex];
  
  // === 1. REGISTER ===
  const registerStart = Date.now();
  const registerRes = http.post(
    `${BASE_URL}/api/register`,
    JSON.stringify({ code: voterCode }),
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { name: 'register' },
    }
  );
  
  const registerCheck = check(registerRes, {
    'registration status 200': (r) => r.status === 200 || r.status === 201,
    'registration has cookie': (r) => r.cookies.connectionCookie !== undefined,
  });
  
  registrationDuration.add(Date.now() - registerStart);
  
  if (!registerCheck) {
    voterRegistrationErrors.add(1);
    console.error(`❌ Registration failed for ${voterCode}: ${registerRes.status}`);
    return; // Skip voting if registration failed
  }
  
  // Extract cookie for subsequent requests
  const cookie = registerRes.cookies.connectionCookie[0].value;
  
  sleep(Math.random() * 2); // Random think time 0-2s
  
  // === 2. VOTE ===
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
  
  voteDuration.add(Date.now() - voteStart);
  
  const voteCheck = check(voteRes, {
    'vote status 200': (r) => r.status === 200,
    'vote recorded': (r) => {
      try {
        return r.json('voted') === true;
      } catch (e) {
        return false;
      }
    },
  });
  
  if (voteCheck) {
    successfulVotes.add(1);
    voteSuccessRate.add(true);
  } else {
    voteSubmissionErrors.add(1);
    voteSuccessRate.add(false);
  }
  
  sleep(1);
}

export function teardown(data) {
  console.log(`\n✅ Test completed for team: ${data.teamName}`);
  console.log(`📊 Check the summary above for detailed metrics`);
}

