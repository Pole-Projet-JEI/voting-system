// 600 voters log in by email at the same moment, read their code from a
// Mailpit catcher, verify it, then vote. Loadtest database only.
import mongoose from "/app/node_modules/mongoose/index.js";
import Voter from "/app/src/mongodb/voterSchema.mjs";
import Team from "/app/src/mongodb/teamSchema.mjs";
import GeofenceSettings from "/app/src/mongodb/geofenceSchema.mjs";
import { setLoginOpen } from "/app/src/email-login/login-window.mjs";

const BASE = process.env.TARGET || "http://frontend:8080";
const MAILPIT = process.env.MAILPIT || "http://mailpit:8025";
const N = Number(process.env.VOTERS || 600);

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
const post = (path, body, cookie) =>
  fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });

await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 5000 });
const report = { N };

// Setup: fresh email voters, one voting team, location check off for this test.
await Voter.deleteMany({ email: { $exists: true } });
await Team.deleteMany({});
const team = await Team.create({ teamName: "EmailTeam", state: "voting", presenting: true });
await GeofenceSettings.updateOne({ key: "venue" }, { $set: { enabled: false } }, { upsert: true });
await fetch(`${MAILPIT}/api/v1/messages`, { method: "DELETE" });
const emails = Array.from({ length: N }, (_, i) => `voter${String(i).padStart(3, "0")}@loadtest.example`);
await Voter.insertMany(emails.map((email) => ({ email, votes: {} })));

// 1. Login closed: requests must be refused.
await setLoginOpen(false);
await new Promise((r) => setTimeout(r, 3500));
const closed = await post("/api/login/email/request", { email: emails[0] });
report.loginClosedStatus = closed.status;

// 2. Unknown email refused.
await setLoginOpen(true);
await new Promise((r) => setTimeout(r, 3500));
report.unknownEmailStatus = (await post("/api/login/email/request", { email: "intruder@evil.example" })).status;

// 3. All N request a code at once.
let t = performance.now();
const requests = await Promise.all(
  emails.map(async (email) => {
    const start = performance.now();
    try {
      const res = await post("/api/login/email/request", { email });
      return { status: res.status, ms: performance.now() - start };
    } catch (error) {
      return { status: error.cause?.code || error.message, ms: performance.now() - start };
    }
  })
);
report.requestCode = { wallMs: Math.round(performance.now() - t), statuses: tally(requests.map((r) => r.status)), latencyMs: summarize(requests.map((r) => r.ms)) };

// 4. Read every code from the mail catcher.
const codes = new Map();
for (let page = 0; codes.size < N && page < 20; page++) {
  const list = await (await fetch(`${MAILPIT}/api/v1/messages?limit=1000&start=${page * 1000}`)).json();
  for (const m of list.messages || []) {
    const match = /(\d{6}) is your voting code/.exec(m.Subject);
    if (match) codes.set(m.To[0].Address.toLowerCase(), match[1]);
  }
  if ((list.messages || []).length < 1000) break;
}
report.emailsReceived = codes.size;

// 5. Wrong code for one voter, then everyone verifies at once.
report.wrongCodeStatus = (await post("/api/login/email/verify", { email: emails[0], code: codes.get(emails[0]) === "000000" ? "111111" : "000000" })).status;
t = performance.now();
const sessions = await Promise.all(
  emails.map(async (email) => {
    const start = performance.now();
    const res = await post("/api/login/email/verify", { email, code: codes.get(email) || "000000" });
    const cookie = (res.headers.get("set-cookie") || "").split(";")[0];
    return { status: res.status, cookie, ms: performance.now() - start };
  })
);
report.verify = { wallMs: Math.round(performance.now() - t), statuses: tally(sessions.map((s) => s.status)), latencyMs: summarize(sessions.map((s) => s.ms)) };

// 6. Reusing a code must fail.
report.codeReuseStatus = (await post("/api/login/email/verify", { email: emails[1], code: codes.get(emails[1]) })).status;

// 7. Closing login blocks new logins but logged-in voters can still vote.
await setLoginOpen(false);
await new Promise((r) => setTimeout(r, 3500));
report.requestAfterCloseStatus = (await post("/api/login/email/request", { email: emails[2] })).status;
t = performance.now();
const votes = await Promise.all(
  sessions.map(async (s, i) => {
    if (s.status !== 201) return { status: "no-session" };
    const start = performance.now();
    const res = await post(`/api/vote/${team._id}`, { vote: i % 2 ? "yes" : "no" }, s.cookie);
    return { status: res.status, ms: performance.now() - start };
  })
);
report.voteAfterLoginClosed = { wallMs: Math.round(performance.now() - t), statuses: tally(votes.map((v) => v.status)), latencyMs: summarize(votes.filter((v) => v.ms).map((v) => v.ms)) };
const stored = await Voter.countDocuments({ [`votes.${team._id}`]: { $exists: true } });
const dbTeam = await Team.findById(team._id).lean();
report.storedVotes = stored;
report.teamCounter = dbTeam.nyes + dbTeam.nno;

await mongoose.disconnect();
console.log("REPORT_JSON " + JSON.stringify(report));
process.exit(0);
