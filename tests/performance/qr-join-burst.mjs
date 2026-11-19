// 600 phones scan the rotating QR code at the same moment, then vote.
// Runs inside a container built from the backend image (same SESSION_SECRET
// as the backend, so it can mint the current token). Loadtest database only.
import mongoose from "/app/node_modules/mongoose/index.js";
import Voter from "/app/src/mongodb/voterSchema.mjs";
import Team from "/app/src/mongodb/teamSchema.mjs";
import GeofenceSettings from "/app/src/mongodb/geofenceSchema.mjs";
import { setLoginOpen } from "/app/src/access/login-window.mjs";
import { createQrToken } from "/app/src/access/qr-token.mjs";

const BASE = process.env.TARGET || "http://frontend:8080";
const N = Number(process.env.VOTERS || 600);
const RESCANS = 50;

if (!/loadtest/.test(process.env.MONGO_URI || "")) {
  throw new Error("Refusing to run: MONGO_URI must point at a loadtest database");
}

const pct = (arr, p) => {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return Math.round(s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]);
};
const summarize = (lat) => ({ n: lat.length, p50: pct(lat, 50), p95: pct(lat, 95), max: pct(lat, 100) });
const tally = (xs) => xs.reduce((m, x) => ((m[x] = (m[x] || 0) + 1), m), {});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cookiesOf = (res) =>
  (res.headers.getSetCookie?.() || [])
    .map((c) => c.split(";")[0])
    .join("; ");
const post = (path, body, cookie) =>
  fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
const timed = async (fn) => {
  const start = performance.now();
  try {
    const res = await fn();
    return { res, status: res.status, ms: performance.now() - start };
  } catch (error) {
    return { status: error.cause?.code || error.message, ms: performance.now() - start };
  }
};

await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 5000 });
const report = { N };

await Voter.deleteMany({});
await Team.deleteMany({});
const team = await Team.create({ teamName: "QrTeam", state: "voting", presenting: true });
await GeofenceSettings.updateOne({ key: "venue" }, { $set: { enabled: false } }, { upsert: true });

// 1. Login closed: a fresh token is still refused.
await setLoginOpen(false);
await sleep(3500);
report.loginClosedStatus = (await post("/api/join", { t: createQrToken().token })).status;

await setLoginOpen(true);
await sleep(3500);

// 2. Bad tokens.
const fresh = createQrToken().token;
report.forgedStatus = (await post("/api/join", { t: fresh.replace(/-./, "-A") === fresh ? fresh.replace(/-./, "-B") : fresh.replace(/-./, "-A") })).status;
report.missingStatus = (await post("/api/join", {})).status;
report.oldTokenStatus = (await post("/api/join", { t: createQrToken(Date.now() - 31_000).token })).status;
report.graceTokenStatus = (await post("/api/join", { t: createQrToken(Date.now() - 21_000).token })).status;
await Voter.deleteMany({}); // drop the grace-test voter

// 3. N phones scan the same code at once.
const token = createQrToken().token;
let t = performance.now();
const joins = await Promise.all(Array.from({ length: N }, () => timed(() => post("/api/join", { t: token }))));
report.join = {
  wallMs: Math.round(performance.now() - t),
  statuses: tally(joins.map((j) => j.status)),
  latencyMs: summarize(joins.map((j) => j.ms)),
};
const sessions = joins.map((j) => (j.res ? cookiesOf(j.res) : ""));
report.votersAfterJoin = await Voter.countDocuments();

// 4. Same phones re-scan a later code with only their device cookie:
//    must give back the same voter, not a new one.
const deviceOnly = sessions.slice(0, RESCANS).map((c) => c.split("; ").filter((p) => p.startsWith("voterDevice=")).join("; "));
const rescans = await Promise.all(deviceOnly.map((c) => timed(() => post("/api/join", { t: createQrToken().token }, c))));
report.rescan = { statuses: tally(rescans.map((r) => r.status)), reused: rescans.filter((r) => r.res && r.res.status === 201).length };
report.votersAfterRescan = await Voter.countDocuments();
for (let i = 0; i < RESCANS; i++) {
  if (rescans[i].res?.status === 201) sessions[i] = cookiesOf(rescans[i].res);
}

// 5. Phone with a live session opening an old link: still fine, no new voter.
report.liveSessionOldLinkStatus = (await post("/api/join", { t: "0-AAAAAAAAAAAAAAAAAAAAAA" }, sessions[RESCANS + 1])).status;

// 6. Everyone votes at once.
t = performance.now();
const votes = await Promise.all(
  sessions.map((cookie, i) =>
    cookie ? timed(() => post(`/api/vote/${team._id}`, { vote: i % 2 ? "yes" : "no" }, cookie)) : { status: "no-session" }
  )
);
report.vote = {
  wallMs: Math.round(performance.now() - t),
  statuses: tally(votes.map((v) => v.status)),
  latencyMs: summarize(votes.filter((v) => v.ms).map((v) => v.ms)),
};

// 7. Second vote from the same phone refused.
report.doubleVoteStatus = (await post(`/api/vote/${team._id}`, { vote: "yes" }, sessions[0])).status;

const dbTeam = await Team.findById(team._id).lean();
report.storedVotes = await Voter.countDocuments({ [`votes.${team._id}`]: { $exists: true } });
report.teamCounter = dbTeam.nyes + dbTeam.nno;
report.finalVoters = await Voter.countDocuments();

await mongoose.disconnect();
console.log("REPORT_JSON " + JSON.stringify(report));
process.exit(0);
