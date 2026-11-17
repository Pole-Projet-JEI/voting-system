import http from 'k6/http';
import { check, fail } from 'k6';
import { Rate } from 'k6/metrics';
import { baseUrl, requireTestTarget, testVoterCodes, authSuccess, authRateLimitCorrect } from './helpers.js';

const mode = (__ENV.AUTH_MODE || 'concurrent').toLowerCase();
const codes = __ENV.TEST_VOTERS_FILE ? JSON.parse(open(__ENV.TEST_VOTERS_FILE)) : null;
const authVus = Number(__ENV.AUTH_VUS || 5);
export const options = mode === 'rate-limit'
  ? { vus: 1, iterations: 6, thresholds: { http_req_failed: ['rate<0.01'], checks: ['rate>0.99'], authentication_success: ['rate>0.8'], authentication_rate_limit_correct: ['rate>0.99'] } }
  : mode === 'invalid-code'
    ? { vus: 1, iterations: 1, thresholds: { http_req_failed: ['rate<0.01'], checks: ['rate>0.99'] } }
    : { scenarios: { voter_auth: { executor: 'per-vu-iterations', vus: authVus, iterations: 1 } }, thresholds: { http_req_failed: ['rate<0.01'], checks: ['rate>0.99'], authentication_success: ['rate>0.99'] } };

export function setup() {
  requireTestTarget();
  if (mode === 'rate-limit' && (!Array.isArray(codes) || codes.length < 6 || new Set(codes).size !== codes.length || codes.slice(0, 6).some(code => typeof code !== 'string' || !/^[A-Za-z0-9]{9}$/.test(code)))) fail('AUTH_MODE=rate-limit requires six distinct provisioned test voter codes.');
  if (mode === 'invalid-code') return;
  if (mode === 'concurrent' && (!Number.isInteger(authVus) || authVus < 1 || authVus > 5 || testVoterCodes().length < authVus)) fail('Concurrent registration is limited to 1–5 VUs per 15-minute window from this load-generator IP and requires at least that many unique test voters.');
  if (!['rate-limit', 'invalid-code', 'concurrent'].includes(mode)) fail(`Unknown AUTH_MODE '${mode}'.`);
}

export default function () {
  if (mode === 'rate-limit') {
    const i = __ITER;
    const res = register(codes[i]);
    const expected = i < 5 ? res.status === 201 && res.json('status') === 'succeeded' && Boolean(res.cookies?.connectionCookie?.[0]?.value) : res.status === 429 && res.json('retryAfterSeconds') > 0;
    check(res, { [`registration request ${i + 1} matches the 5-per-15m limit`]: () => expected });
    authSuccess.add(i < 5 && res.status === 201);
    authRateLimitCorrect.add(expected);
    return;
  }
  if (mode === 'invalid-code') {
    const res = register('INVALID00', http.expectedStatuses(400));
    check(res, { 'well-formed unknown voter code is rejected': r => r.status === 400 && r.json('message') === 'Invalid code' });
    return;
  }

  const code = testVoterCodes()[__VU - 1];
  const res = register(code);
  const loginOk = res.status === 201 && res.json('status') === 'succeeded' && Boolean(res.cookies?.connectionCookie?.[0]?.value);
  authSuccess.add(loginOk);
  check(res, { 'voter login succeeds with participant cookie': () => loginOk });
  if (loginOk) {
    const connected = http.get(`${baseUrl}/api/isconnected`);
    check(connected, { 'this VU session authenticates independently': r => r.status === 200 && r.json('connected') === true });
  }
}

function register(code, responseCallback = http.expectedStatuses(201, 400, 429)) {
  return http.post(`${baseUrl}/api/register`, JSON.stringify({ code }), { headers: { 'Content-Type': 'application/json' }, responseCallback });
}
