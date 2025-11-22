import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

const voterRegistrationErrors = new Counter('voter_registration_errors');
const voteSubmissionErrors = new Counter('vote_submission_errors');
const successfulVotes = new Counter('successful_votes');
const voteSuccessRate = new Rate('vote_success_rate');
const registrationDuration = new Trend('registration_duration');
const voteDuration = new Trend('vote_duration');

const voterCodes = JSON.parse(open('./voter-codes.json')).codes;

export const options = {
  scenarios: {
    warmup: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 50 },
        { duration: '1m', target: 50 },
        { duration: '10s', target: 0 },
      ],
      gracefulRampDown: '10s',
    },
    spike: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: 200 },
        { duration: '30s', target: 200 },
        { duration: '10s', target: 0 },
      ],
      startTime: '2m',
    },
    sustained: {
      executor: 'constant-vus',
      vus: 100,
      duration: '3m',
      startTime: '4m',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<2000', 'p(99)<3000'],
    http_req_failed: ['rate<0.05'],
    vote_success_rate: ['rate>0.95'],
    registration_duration: ['p(95)<1000'],
    vote_duration: ['p(95)<1500'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export function setup() {
  const res = http.get(`${BASE_URL}/api/currentteam`);
  if (res.status !== 200 || !res.json().teamID) {
    throw new Error('No team presenting. Set a team via admin panel first.');
  }
  const data = res.json();
  console.log(`Testing with team: ${data.teamName}`);
  return { teamID: data.teamID, teamName: data.teamName };
}

export default function(data) {
  const codeIndex = (__VU + __ITER * 1000) % voterCodes.length;
  const voterCode = voterCodes[codeIndex];
  
  const registerStart = Date.now();
  const registerRes = http.post(
    `${BASE_URL}/api/register`,
    JSON.stringify({ code: voterCode }),
    { headers: { 'Content-Type': 'application/json' }, tags: { name: 'register' } }
  );
  
  registrationDuration.add(Date.now() - registerStart);
  
  const registerCheck = check(registerRes, {
    'registration status 200': (r) => r.status === 200 || r.status === 201,
    'registration has cookie': (r) => r.cookies.connectionCookie !== undefined,
  });
  
  if (!registerCheck) {
    voterRegistrationErrors.add(1);
    return;
  }
  
  const cookie = registerRes.cookies.connectionCookie[0].value;
  sleep(Math.random() * 2);
  
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
      try { return r.json('voted') === true; }
      catch (e) { return false; }
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
  console.log(`Test completed for team: ${data.teamName}`);
}

