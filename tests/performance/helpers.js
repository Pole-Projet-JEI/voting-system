import http from 'k6/http';
import { fail } from 'k6';
import { Counter, Rate } from 'k6/metrics';

export const baseUrl = __ENV.BASE_URL || '';
export const authSuccess = new Rate('authentication_success');
export const authRateLimitCorrect = new Rate('authentication_rate_limit_correct');
export const successfulVotes = new Counter('successful_votes');
export const voteOutcomes = new Counter('vote_attempts');
export const voteResponseCorrectness = new Rate('vote_response_correctness');
export const duplicateRejections = new Counter('duplicate_vote_rejections');
export const consistencyFailures = new Counter('data_consistency_failures');
export const dataConsistency = new Rate('data_consistency');
export const unexpectedVoteResponses = new Rate('unexpected_vote_responses');

const targetReceipt = __ENV.TARGET_RECEIPT ? JSON.parse(open(__ENV.TARGET_RECEIPT)) : null;
const provisionedSessions = __ENV.SESSION_FILE ? JSON.parse(open(__ENV.SESSION_FILE)) : null;
const testVoters = __ENV.TEST_VOTERS_FILE ? JSON.parse(open(__ENV.TEST_VOTERS_FILE)) : null;

export function runId() { return __ENV.TEST_RUN_ID || ''; }
export function requireTestTarget() {
  const receiptAge = targetReceipt ? Date.now() - Date.parse(targetReceipt.checkedAt) : Infinity;
  if (baseUrl !== 'http://127.0.0.1:3180' || !targetReceipt || receiptAge < 0 || receiptAge > 10 * 60 * 1000 ||
      targetReceipt.baseUrl !== baseUrl || targetReceipt.runId !== runId() ||
      targetReceipt.database !== `voting_performance_test_${runId()}` ||
      targetReceipt.project !== 'voting-performance-test') {
    fail('Test target verification missing or stale. Run tests/performance/preflight.mjs and set BASE_URL, TEST_RUN_ID, and TARGET_RECEIPT from its verified local Compose environment.');
  }
}
export function testVoterCodes() {
  if (!Array.isArray(testVoters) || !testVoters.length || testVoters.some(code => typeof code !== 'string' || !/^[A-Za-z0-9]{9}$/.test(code)) || new Set(testVoters).size !== testVoters.length) {
    fail('TEST_VOTERS_FILE must point to a JSON array of unique, provisioned test voter codes.');
  }
  return testVoters;
}
export function provisionedVoters() {
  if (!provisionedSessions || provisionedSessions.runId !== runId() || !Array.isArray(provisionedSessions.voters)) {
    fail('SESSION_FILE is missing or belongs to another run. Run the explicit session provisioning step after preflight.');
  }
  const codes = provisionedSessions.voters.map(v => v.code);
  if (codes.some(code => typeof code !== 'string' || !/^[A-Za-z0-9]{9}$/.test(code)) || new Set(codes).size !== codes.length || provisionedSessions.voters.some(v => typeof v.cookie !== 'string' || !v.vote)) {
    fail('Provisioned sessions must have unique voter identities and independent authenticated cookies.');
  }
  return provisionedSessions;
}
export function adminLogin() {
  if (!__ENV.ADMIN_USERNAME || !__ENV.ADMIN_PASSWORD) fail('ADMIN_USERNAME and ADMIN_PASSWORD are required.');
  const res = http.post(`${baseUrl}/api/admin/login`, JSON.stringify({ username: __ENV.ADMIN_USERNAME, secretKey: __ENV.ADMIN_PASSWORD }), { headers: { 'Content-Type': 'application/json' } });
  if (res.status !== 200) fail(`Admin login failed during setup (HTTP ${res.status}).`);
  const cookie = res.cookies?.adminToken?.[0]?.value;
  if (!cookie) fail('Admin login returned 200 but no adminToken cookie was present.');
  const probe = http.get(`${baseUrl}/api/admin/teams`, { headers: { Cookie: `adminToken=${cookie}` } });
  let body;
  try { body = probe.json(); } catch (_) { body = null; }
  if (probe.status !== 200 || !Array.isArray(body?.teams)) fail(`Admin cookie failed protected endpoint verification (HTTP ${probe.status}).`);
  return `adminToken=${cookie}`;
}
export function json(res) { try { return res.json(); } catch (_) { return null; } }
export function recordVoteOutcome(index, session, outcome, correct) {
  const tags = { run_id: runId(), voter_index: String(index), submitted_vote: session.vote, outcome };
  voteOutcomes.add(1, tags);
  voteResponseCorrectness.add(correct, tags);
  unexpectedVoteResponses.add(!correct, tags);
  if (outcome === 'accepted') successfulVotes.add(1, tags);
  if (outcome === 'duplicate_rejected') duplicateRejections.add(1, tags);
}
