import http from 'k6/http';
import { check, fail } from 'k6';
import { profile } from './scenarios.js';
import { baseUrl, requireTestTarget, adminLogin, json, dataConsistency, consistencyFailures } from './helpers.js';

export const options = { ...profile(), thresholds: { ...profile().thresholds, data_consistency: ['rate>0.999'] } };
export function setup() {
  requireTestTarget();
  if (__ENV.ADMIN_TRANSITIONS === 'true' && (!__ENV.TEAM_ID || !__ENV.NEXT_TEAM_ID || __ENV.TEAM_ID === __ENV.NEXT_TEAM_ID)) {
    fail('Admin transition checks require distinct fresh TEAM_ID and NEXT_TEAM_ID values in the dedicated test database.');
  }
  return { cookie: adminLogin() };
}

export default function (data) {
  const params = { headers: { Cookie: data.cookie } };
  const teams = getTeams(params);
  const teamsValid = teams.status === 200 && Array.isArray(json(teams)?.teams);
  check(teams, { 'protected teams endpoint returns a team list': () => teamsValid });
  dataConsistency.add(teamsValid);
  if (!teamsValid) consistencyFailures.add(1);

  const current = http.get(`${baseUrl}/api/admin/presenting`, params);
  const currentValid = current.status === 200 && typeof json(current)?.presenting === 'boolean' && (json(current)?.presenting ? Boolean(json(current)?.team?._id) : json(current)?.team === null);
  check(current, { 'presenting endpoint returns the documented state': () => currentValid });
  dataConsistency.add(currentValid);
  if (!currentValid) consistencyFailures.add(1);
  if (__ENV.ADMIN_TRANSITIONS === 'true' && __VU === 1 && __ITER === 0) runSerializedTransitions(params);
}

function runSerializedTransitions(params) {
  const before = getTeams(params);
  const beforeTeams = json(before)?.teams;
  if (before.status !== 200 || !Array.isArray(beforeTeams) || beforeTeams.some(t => t.presenting)) fail('Transition fixture must start with no team presenting.');
  const selected = beforeTeams.find(t => String(t._id) === __ENV.TEAM_ID);
  const next = beforeTeams.find(t => String(t._id) === __ENV.NEXT_TEAM_ID);
  if (!selected || !next || selected.presented || next.presented || selected.state !== 'pending' || next.state !== 'pending') fail('TEAM_ID and NEXT_TEAM_ID must identify two fresh pending teams.');

  const jsonParams = { headers: { ...params.headers, 'Content-Type': 'application/json' }, responseCallback: http.expectedStatuses(200, 400) };
  const choose = http.post(`${baseUrl}/api/admin/presenting`, JSON.stringify({ teamId: __ENV.TEAM_ID }), jsonParams);
  assertTransition(choose, choose.status === 200 && json(choose)?.team?.presenting === true && json(choose)?.team?.state === 'presenting' && json(choose)?.team?.presented === false, 'fresh team enters presenting state');
  assertPresenterSet(params, __ENV.TEAM_ID, 'presenting', false);

  const attemptedSwitch = http.post(`${baseUrl}/api/admin/presenting`, JSON.stringify({ teamId: __ENV.NEXT_TEAM_ID }), jsonParams);
  const switchRejected = attemptedSwitch.status === 400 && json(attemptedSwitch)?.message === 'Another team is currently presenting';
  assertTransition(attemptedSwitch, switchRejected, 'switching while a team is active is rejected');
  assertPresenterSet(params, __ENV.TEAM_ID, 'presenting', false, __ENV.NEXT_TEAM_ID);

  const voting = http.post(`${baseUrl}/api/admin/presenting/voting`, null, { headers: params.headers });
  assertTransition(voting, voting.status === 200 && json(voting)?.team?.presenting === true && json(voting)?.team?.state === 'voting', 'selected team enters voting state');
  assertPresenterSet(params, __ENV.TEAM_ID, 'voting', false, __ENV.NEXT_TEAM_ID);

  const stop = http.del(`${baseUrl}/api/admin/presenting`, null, { headers: params.headers });
  assertTransition(stop, stop.status === 200 && json(stop)?.success === true, 'explicit completion succeeds');
  assertPresenterSet(params, null, 'ended', true, __ENV.NEXT_TEAM_ID, __ENV.TEAM_ID);
}

function getTeams(params) { return http.get(`${baseUrl}/api/admin/teams`, params); }
function assertPresenterSet(params, activeId, activeState, activePresented, pendingId, endedId) {
  const response = getTeams(params);
  const list = json(response)?.teams;
  const active = activeId && list?.find(t => String(t._id) === activeId);
  const pending = pendingId && list?.find(t => String(t._id) === pendingId);
  const ended = endedId && list?.find(t => String(t._id) === endedId);
  const presentingCount = list?.filter(t => t.presenting === true).length;
  const ok = response.status === 200 && Array.isArray(list) && presentingCount === (activeId ? 1 : 0) &&
    (!activeId || (active?.presenting === true && active?.state === activeState && active?.presented === activePresented)) &&
    (!pendingId || (pending?.presenting === false && pending?.presented === false && pending?.state === 'pending')) &&
    (!endedId || (ended?.presenting === false && ended?.presented === true && ended?.state === 'ended'));
  dataConsistency.add(ok);
  if (!ok) consistencyFailures.add(1);
  check(response, { 'admin presentation state is consistent and exclusive': () => ok });
  if (!ok) fail('Unexpected presentation state after admin operation.');
}
function assertTransition(response, ok, description) {
  dataConsistency.add(ok);
  if (!ok) consistencyFailures.add(1);
  check(response, { [description]: () => ok });
  if (!ok) fail(`Admin transition assertion failed: ${description}.`);
}
