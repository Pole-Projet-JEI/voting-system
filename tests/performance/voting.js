import http from 'k6/http';
import { check, fail, sleep } from 'k6';
import { profile, peakVus } from './scenarios.js';
import { baseUrl, requireTestTarget, provisionedVoters, json, recordVoteOutcome } from './helpers.js';

const mode = (__ENV.VOTING_MODE || 'benchmark').toLowerCase();
const profileName = (__ENV.PROFILE || 'smoke').toLowerCase();
const sessions = __ENV.SESSION_FILE ? JSON.parse(open(__ENV.SESSION_FILE)) : null;
const benchmarkVus = peakVus();
const benchmarkOptions = profileName === 'smoke'
  ? {
      scenarios: {
        load: {
          executor: 'per-vu-iterations',
          vus: benchmarkVus,
          iterations: 1,
        },
      },
      thresholds: profile().thresholds,
    }
  : profile();
export const options = mode === 'negative'
  ? { scenarios: { negative_votes: { executor: 'per-vu-iterations', vus: 4, iterations: 1 } }, thresholds: { ...profile().thresholds, vote_response_correctness: ['rate>0.999'], successful_votes: ['count==1'], duplicate_vote_rejections: ['count==1'], unexpected_vote_responses: ['rate<0.001'] } }
  : { ...benchmarkOptions, thresholds: { ...benchmarkOptions.thresholds, vote_response_correctness: ['rate>0.999'], [`successful_votes{run_id:${__ENV.TEST_RUN_ID || 'missing'}}`]: [`count==${benchmarkVus}`], unexpected_vote_responses: ['rate<0.001'] } };

export function setup() {
  requireTestTarget();
  const fixture = provisionedVoters();
  if (fixture.teamId !== __ENV.TEAM_ID || fixture.runId !== __ENV.TEST_RUN_ID) fail('Session fixture TEAM_ID or TEST_RUN_ID does not match this run.');
  const required = mode === 'negative' ? 4 : benchmarkVus;
  if (fixture.voters.length !== required) fail(`Need exactly ${required} independent pre-authenticated voter sessions; fixture contains ${fixture.voters.length}.`);
  if (!['benchmark', 'negative'].includes(mode)) fail(`Unknown VOTING_MODE '${mode}'.`);
}

export default function () {
  if (mode === 'negative') {
    runNegativeCases();
  } else {
    runBenchmarkVote();
  }

  // Keep each VU occupied during ramping profiles to prevent repeat votes.
  if (mode !== 'negative' && profileName !== 'smoke') {
    sleep(24 * 60 * 60);
  }
}

function runBenchmarkVote() {
  const fixture = sessions.voters[__VU - 1];
  if (!fixture) fail(`No independent provisioned session for VU ${__VU}.`);
  const res = postVote(fixture, sessions.teamId, fixture.vote);
  const body = json(res);
  const accepted = res.status === 200 && body?.voted === true && body?.vote === fixture.vote;
  const duplicate = res.status === 400 && body?.voted === false && body?.message === 'You have already voted for this team';
  const outcome = accepted ? 'accepted' : duplicate ? 'duplicate_rejected' : 'unexpected';
  recordVoteOutcome(__VU - 1, fixture, outcome, accepted || duplicate);
  check(res, { 'vote response matches the backend contract': () => accepted });

  if (__ENV.TEST_DUPLICATES === 'true' && accepted) {
    const alternateVote = fixture.vote === 'yes' ? 'no' : 'yes';
    const retry = postVote(fixture, sessions.teamId, alternateVote);
    const retryBody = json(retry);
    const rejected = retry.status === 400 && retryBody?.voted === false && retryBody?.message === 'You have already voted for this team' && retryBody?.existingVote === fixture.vote;
    recordVoteOutcome(__VU - 1, fixture, rejected ? 'duplicate_rejected' : 'unexpected', rejected);
    check(retry, { 'same-session duplicate is rejected without changing its vote': () => rejected });
  }
}

function runNegativeCases() {
  const index = __VU - 1;
  const fixture = sessions.voters[index];
  if (!fixture) fail(`Negative test requires independent fixture session ${index}.`);
  if (index === 0) {
    const res = http.post(`${baseUrl}/api/vote/${sessions.teamId}`, JSON.stringify({ vote: fixture.vote }), { headers: { 'Content-Type': 'application/json' }, responseCallback: http.expectedStatuses(401) });
    const ok = res.status === 401 && json(res)?.authenticated === false;
    recordVoteOutcome(index, fixture, ok ? 'unauthenticated_rejected' : 'unexpected', ok);
    check(res, { 'unauthenticated vote is rejected': () => ok });
  } else if (index === 1) {
    const res = postVote(fixture, sessions.teamId, 'maybe');
    const ok = res.status === 400 && json(res)?.voted === false && json(res)?.message === "Vote must be 'yes' or 'no'";
    recordVoteOutcome(index, fixture, ok ? 'invalid_vote_rejected' : 'unexpected', ok);
    check(res, { 'invalid vote value is rejected': () => ok });
  } else if (index === 2) {
    const res = postVote(fixture, 'not-an-object-id', fixture.vote);
    const ok = res.status === 400 && json(res)?.voted === false && json(res)?.message === 'Invalid team ID';
    recordVoteOutcome(index, fixture, ok ? 'malformed_team_rejected' : 'unexpected', ok);
    check(res, { 'malformed team ID is rejected independently': () => ok });
  } else {
    const initial = postVote(fixture, sessions.teamId, fixture.vote);
    const initialBody = json(initial);
    const accepted = initial.status === 200 && initialBody?.voted === true && initialBody?.vote === fixture.vote;
    recordVoteOutcome(index, fixture, accepted ? 'accepted' : 'unexpected', accepted);
    check(initial, { 'duplicate test begins with one valid vote': () => accepted });
    if (accepted) {
      const alternateVote = fixture.vote === 'yes' ? 'no' : 'yes';
      const retry = postVote(fixture, sessions.teamId, alternateVote);
      const retryBody = json(retry);
      const rejected = retry.status === 400 && retryBody?.voted === false && retryBody?.message === 'You have already voted for this team' && retryBody?.existingVote === fixture.vote;
      recordVoteOutcome(index, fixture, rejected ? 'duplicate_rejected' : 'unexpected', rejected);
      check(retry, { 'duplicate vote is rejected with original vote intact': () => rejected });
    }
  }
}

function postVote(fixture, teamId, vote) {
  return http.post(`${baseUrl}/api/vote/${teamId}`, JSON.stringify({ vote }), {
    headers: { 'Content-Type': 'application/json', Cookie: fixture.cookie },
    responseCallback: http.expectedStatuses(200, 400, 401),
  });
}
