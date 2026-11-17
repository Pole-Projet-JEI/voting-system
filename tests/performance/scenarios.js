const profiles = {
  smoke: {
  stages: [
    { duration: '10s', target: 5 },
    { duration: '10s', target: 5 },
    { duration: '1s', target: 0 },
  ],
},
  normal: { stages: [{ duration: '30s', target: 20 }, { duration: '1m', target: 50 }, { duration: '30s', target: 0 }] },
  stress: { stages: [{ duration: '1m', target: 100 }, { duration: '1m', target: 200 }, { duration: '30s', target: 0 }] },
  spike: { stages: [{ duration: '20s', target: 10 }, { duration: '10s', target: 100 }, { duration: '1m', target: 100 }, { duration: '20s', target: 0 }] },
};

export function profile() {
  const name = (__ENV.PROFILE || 'smoke').toLowerCase();
  if (name === 'soak') {
    const vus = Number(__ENV.SOAK_VUS || 30);
    const ramp = __ENV.SOAK_RAMP || '1m';
    const hold = __ENV.SOAK_DURATION || '12m';
    return rampingProfile([{ duration: ramp, target: vus }, { duration: hold, target: vus }, { duration: '30s', target: 0 }]);
  }
  const selected = profiles[name];
  if (!selected) throw new Error(`Unknown PROFILE '${name}'`);
  return rampingProfile(selected.stages);
}
function rampingProfile(stages) {
  return {
    scenarios: { load: { executor: 'ramping-vus', startVUs: 0, stages, gracefulRampDown: '0s', gracefulStop: '0s' } },
    thresholds: baseThresholds(),
  };
}
function baseThresholds() {
  return {
    http_req_duration: [`p(95)<${__ENV.P95_MS || 1000}`, `p(99)<${__ENV.P99_MS || 2000}`],
    http_req_failed: [`rate<${__ENV.FAILURE_RATE || 0.02}`],
    checks: ['rate>0.99'],
  };
}
export function peakVus() {
  const name = (__ENV.PROFILE || 'smoke').toLowerCase();
  const peaks = { smoke: 5, normal: 50, stress: 200, spike: 100, soak: Number(__ENV.SOAK_VUS || 30) };
  const value = peaks[name];
  if (!value || !Number.isInteger(value) || value < 1) throw new Error(`Unknown or invalid PROFILE '${name}'.`);
  return Math.max(value, Number(__ENV.REQUIRED_VUS || 0));
}
