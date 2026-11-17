import http from 'k6/http';
import { check, sleep } from 'k6';
import { profile } from './scenarios.js';
import { baseUrl, requireTestTarget, adminLogin, json, dataConsistency, consistencyFailures } from './helpers.js';

export const options = { ...profile(), thresholds: { ...profile().thresholds, data_consistency: ['rate>0.999'] } };
export function setup() { requireTestTarget(); return { cookie: adminLogin() }; }
export default function (data) {
  const res = http.get(`${baseUrl}/api/admin/teams`, { headers: { Cookie: data.cookie } });
  const payload = json(res);
  const valid = res.status === 200 && Array.isArray(payload?.teams) && payload.count === payload.teams.length &&
    payload.teams.every(t => typeof t._id === 'string' && Number.isFinite(t.nyes) && Number.isFinite(t.nno));
  check(res, { 'admin dashboard returns teams and numeric vote counters': () => valid });
  dataConsistency.add(valid);
  if (!valid) consistencyFailures.add(1);
  if ((__ENV.PROFILE || '').toLowerCase() === 'soak') sleep(1);
}
