// 600-voter simultaneous load + geofence audit.
// Runs inside a container built from the backend image (needs /app modules,
// MONGO_URI and SESSION_SECRET). Never point it at a production database.
import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import mongoose from "/app/node_modules/mongoose/index.js";
import Voter from "/app/src/mongodb/voterSchema.mjs";
import Team from "/app/src/mongodb/teamSchema.mjs";
import GeofenceSettings from "/app/src/mongodb/geofenceSchema.mjs";
import { hashVoterCode } from "/app/src/mongodb/voter-code.mjs";
import { getOfficialResults } from "/app/src/admin/services/officialResultsService.mjs";

const require = createRequire("/app/package.json");
const cookieSignature = require("cookie-signature");

const BASE = process.env.TARGET || "http://frontend:8080";
const N = Number(process.env.VOTERS || 600);
const ROUNDS = Number(process.env.ROUNDS || 4);
const VENUE = { latitude: 36.842563, longitude: 10.19751 };
const RADIUS = Number(process.env.RADIUS || 50);
const MAX_ACC = Number(process.env.MAX_ACC || 60);
const SKIP_RATE = 0.08;
const DUPLICATES = 30;

if (!/loadtest/.test(process.env.MONGO_URI || "")) {
  throw new Error("Refusing to run: MONGO_URI must point at a loadtest database");
}

// Deterministic RNG so runs are comparable.
let seed = 42;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const between = (a, b) => a + rand() * (b - a);

const offset = (meters) => {
  const bearing = rand() * 2 * Math.PI;
  return {
    latitude: VENUE.latitude + (meters * Math.cos(bearing)) / 111_195,
    longitude:
      VENUE.longitude +
      (meters * Math.sin(bearing)) / (111_195 * Math.cos((VENUE.latitude * Math.PI) / 180)),
  };
};

const haversine = (a, b) => {
  const r = (d) => (d * Math.PI) / 180;
  const h =
    Math.sin(r(b.latitude - a.latitude) / 2) ** 2 +
    Math.cos(r(a.latitude)) * Math.cos(r(b.latitude)) * Math.sin(r(b.longitude - a.longitude) / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
};

const categoryFor = (i) =>
  i < 420 * (N / 600) ? "inside" : i < 480 * (N / 600) ? "edge" : i < 560 * (N / 600) ? "outside" : "inaccurate";

const makeLocation = (category) => {
  const [dist, acc] = {
    inside: [between(0, 40), between(5, 50)],
    edge: [between(40, 60), between(20, 60)],
    outside: [between(100, 5000), between(5, 50)],
    inaccurate: [between(0, 30), between(61, 500)],
  }[category];
  return { ...offset(dist), accuracy: acc, ageMs: Math.round(between(200, 4000)) };
};

const expectedOutcome = (loc) => {
  if (loc.accuracy > MAX_ACC) return "LOCATION_INACCURATE";
  return Math.round(haversine(VENUE, loc)) > RADIUS ? "OUTSIDE_VENUE" : "OK";
};

const pct = (arr, p) => {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return Math.round(s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]);
};
const summarize = (lat) => ({ n: lat.length, p50: pct(lat, 50), p95: pct(lat, 95), p99: pct(lat, 99), max: pct(lat, 100) });
const tally = (xs) => xs.reduce((m, x) => ((m[x] = (m[x] || 0) + 1), m), {});

const timed = async (fn) => {
  const t = performance.now();
  try {
    const res = await fn();
    return { res, ms: performance.now() - t };
  } catch (error) {
    return { error: error.cause?.code || error.message, ms: performance.now() - t };
  }
};

const report = { config: { N, ROUNDS, RADIUS, MAX_ACC, BASE }, findings: [] };

await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 5000 });

// ---------- setup: teams + geofence ----------
await Team.deleteMany({});
await Voter.updateMany({}, { $set: { votes: {} }, $unset: { participantSessionHash: 1, participantSessionExpiresAt: 1 } });
const teams = await Team.insertMany(
  Array.from({ length: ROUNDS }, (_, i) => ({ teamName: `LoadTeam ${i + 1}`, state: "pending" }))
);
await GeofenceSettings.findOneAndUpdate(
  { key: "venue" },
  { $set: { enabled: true, ...VENUE, radiusMeters: RADIUS, maxAccuracyMeters: MAX_ACC } },
  { upsert: true }
);

const codes = JSON.parse(await readFile(process.env.VOTER_CODES_FILE, "utf8")).slice(0, N);
const voters = codes.map((code, i) => ({ i, code, category: categoryFor(i), cookie: null }));

// ---------- phase A: 600 simultaneous logins (real rate limiter) ----------
const regResults = await Promise.all(
  voters.map((v) =>
    timed(() =>
      fetch(`${BASE}/api/register`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: v.code }),
      })
    ).then(({ res, ms, error }) => {
      if (res?.status === 201) {
        const raw = res.headers.get("set-cookie") || "";
        v.cookie = raw.split(";")[0];
      }
      return { status: error || res.status, ms };
    })
  )
);
report.registration = {
  statuses: tally(regResults.map((r) => r.status)),
  latencyMs: summarize(regResults.map((r) => r.ms)),
};

// Brute-force check: wrong codes from the same IP must eventually be refused.
const wrong = await Promise.all(
  Array.from({ length: 350 }, (_, k) =>
    fetch(`${BASE}/api/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: `ZZ${String(k).padStart(7, "0")}` }),
    }).then((res) => res.status, (error) => error.message)
  )
);
report.registration.wrongCodeBurst = tally(wrong);

// Provision sessions for voters the limiter blocked, so the vote path can be tested.
let provisioned = 0;
for (const v of voters.filter((x) => !x.cookie)) {
  const token = crypto.randomBytes(32).toString("hex");
  await Voter.collection.updateOne(
    { codeHash: hashVoterCode(v.code) },
    {
      $set: {
        participantSessionHash: crypto.createHash("sha256").update(token).digest("hex"),
        participantSessionExpiresAt: new Date(Date.now() + 86_400_000),
      },
    }
  );
  v.cookie = `connectionCookie=${encodeURIComponent(`s:${cookieSignature.sign(token, process.env.SESSION_SECRET)}`)}`;
  provisioned++;
}
report.registration.sessionsProvisionedDirectly = provisioned;

// ---------- phase B: 600 live-update (SSE) connections ----------
const sse = { opened: 0, refused: tally([]), messages: 0, voteUpdates: 0, errors: 0 };
const sseControllers = [];
const sseOpen = await Promise.all(
  voters.map(async () => {
    const controller = new AbortController();
    sseControllers.push(controller);
    try {
      const res = await fetch(`${BASE}/api/sendvote`, { signal: controller.signal });
      if (res.status !== 200) {
        sse.refused[res.status] = (sse.refused[res.status] || 0) + 1;
        return;
      }
      sse.opened++;
      (async () => {
        const decoder = new TextDecoder();
        try {
          for await (const chunk of res.body) {
            const text = decoder.decode(chunk);
            for (const line of text.split("\n")) {
              if (!line.startsWith("data:")) continue;
              sse.messages++;
              if (line.includes("voteUpdate")) sse.voteUpdates++;
            }
          }
        } catch (error) {
          if (error.name !== "AbortError") sse.errors++;
        }
      })();
    } catch (error) {
      sse.refused[error.cause?.code || error.message] = (sse.refused[error.cause?.code || error.message] || 0) + 1;
    }
  })
);
void sseOpen;
report.sse = sse;

// ---------- phase C: rounds of simultaneous votes ----------
const expectedVotes = new Map(); // voterIndex -> Map(teamId -> vote)
report.rounds = [];

for (let r = 0; r < ROUNDS; r++) {
  const team = teams[r];
  const teamId = String(team._id);
  await Team.updateOne({ _id: team._id }, { $set: { state: "voting", presenting: true } });
  await new Promise((resolve) => setTimeout(resolve, 6000)); // > geofence settings cache TTL

  const plans = voters
    .filter((v) => !(v.category === "inside" && rand() < SKIP_RATE))
    .map((v) => {
      const location = makeLocation(v.category);
      return { v, location, vote: rand() < 0.6 ? "yes" : "no", expected: expectedOutcome(location) };
    });

  const send = (p) =>
    timed(() =>
      fetch(`${BASE}/api/vote/${teamId}`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie: p.v.cookie },
        body: JSON.stringify({ vote: p.vote, location: p.location }),
      }).then(async (res) => ({ status: res.status, body: await res.json().catch(() => ({})) }))
    );

  const duplicates = r === 0 ? plans.filter((p) => p.expected === "OK").slice(0, DUPLICATES) : [];
  const sseBefore = sse.voteUpdates;
  const started = performance.now();
  const [results, dupResults] = await Promise.all([
    Promise.all(plans.map(send)),
    Promise.all(duplicates.map(send)),
  ]);
  const burstMs = performance.now() - started;

  const mismatches = [];
  const outcomes = [];
  results.forEach((result, idx) => {
    const p = plans[idx];
    const got = result.error
      ? `NETWORK:${result.error}`
      : result.res.status === 200
        ? "OK"
        : result.res.body.code || (/already voted/i.test(result.res.body.message || "") ? "ALREADY_VOTED" : `HTTP_${result.res.status}`);
    outcomes.push(got);
    // A duplicate twin may have won the race; that still counts as one stored vote.
    const effective = got === "ALREADY_VOTED" && duplicates.includes(p) ? "OK" : got;
    if (effective !== p.expected) mismatches.push({ category: p.v.category, expected: p.expected, got, status: result.res?.status });
    if (effective === "OK") {
      if (!expectedVotes.has(p.v.i)) expectedVotes.set(p.v.i, new Map());
      expectedVotes.get(p.v.i).set(teamId, p.vote);
    }
  });

  const dupOutcomes = dupResults.map((d) => (d.error ? `NETWORK:${d.error}` : d.res.status === 200 ? "OK" : "ALREADY_VOTED/OTHER"));
  // Each duplicate pair must produce exactly one OK in total.
  const pairDoubleOk = duplicates.filter((p, k) => {
    const first = outcomes[plans.indexOf(p)];
    return first === "OK" && dupOutcomes[k] === "OK";
  }).length;

  await new Promise((resolve) => setTimeout(resolve, 3000)); // let SSE drain
  const dbTeam = await Team.findById(team._id).lean();
  const expectedYes = [...expectedVotes.values()].filter((m) => m.get(teamId) === "yes").length;
  const expectedNo = [...expectedVotes.values()].filter((m) => m.get(teamId) === "no").length;
  const storedCount = await Voter.countDocuments({ [`votes.${teamId}`]: { $exists: true } });

  report.rounds.push({
    team: team.teamName,
    sent: plans.length,
    duplicatesSent: duplicates.length,
    burstWallMs: Math.round(burstMs),
    latencyMs: summarize(results.filter((x) => !x.error).map((x) => x.ms)),
    outcomes: tally(outcomes),
    outcomesByCategory: Object.fromEntries(
      ["inside", "edge", "outside", "inaccurate"].map((c) => [
        c,
        tally(outcomes.filter((_, k) => plans[k].v.category === c)),
      ])
    ),
    unexpectedOutcomes: mismatches.length,
    unexpectedSample: mismatches.slice(0, 5),
    duplicatePairsBothAccepted: pairDoubleOk,
    counters: { teamYes: dbTeam.nyes, teamNo: dbTeam.nno, expectedYes, expectedNo, voterDocsWithVote: storedCount },
    countersConsistent: dbTeam.nyes === expectedYes && dbTeam.nno === expectedNo && storedCount === expectedYes + expectedNo,
    sseVoteUpdatesReceived: sse.voteUpdates - sseBefore,
  });

  await Team.updateOne(
    { _id: team._id },
    { $set: { state: "ended", presenting: false, presented: true, presentedAt: new Date() } }
  );
}

// ---------- phase D: official results (all-teams rule) ----------
const official = await getOfficialResults();
const teamIds = teams.map((t) => String(t._id));
const complete = [...expectedVotes.values()].filter((m) => teamIds.every((id) => m.has(id)));
const expectedOfficial = teamIds.map((id) => ({
  yes: complete.filter((m) => m.get(id) === "yes").length,
  no: complete.filter((m) => m.get(id) === "no").length,
}));
report.official = {
  completeVoters: official.completeVoters,
  expectedCompleteVoters: complete.length,
  discardedVoters: official.discardedVoters,
  teams: official.teams.map((t, k) => ({ team: t.teamName, official: t.official, expected: expectedOfficial[k], raw: t.raw })),
  consistent:
    official.completeVoters === complete.length &&
    official.teams.every((t, k) => t.official.yes === expectedOfficial[k].yes && t.official.no === expectedOfficial[k].no),
};

report.sseFinal = { ...sse };
sseControllers.forEach((c) => c.abort());
await mongoose.disconnect();
console.log("REPORT_JSON " + JSON.stringify(report));
process.exit(0);
