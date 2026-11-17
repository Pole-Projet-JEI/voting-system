// Open email login checks (loadtest database only): anyone mode, aliases,
// disposable inboxes, list mode.
import mongoose from "/app/node_modules/mongoose/index.js";
import Voter from "/app/src/mongodb/voterSchema.mjs";
import Team from "/app/src/mongodb/teamSchema.mjs";
import GeofenceSettings from "/app/src/mongodb/geofenceSchema.mjs";
import { updateLoginSettings } from "/app/src/email-login/login-window.mjs";

const BASE = "http://frontend:8080";
const MAILPIT = "http://mailpit:8025";
if (!/loadtest/.test(process.env.MONGO_URI || "")) throw new Error("loadtest database only");

const results = [];
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};
const post = async (path, body, cookie) => {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})), cookie: (res.headers.get("set-cookie") || "").split(";")[0] };
};
const codeFor = async (address) => {
  for (let i = 0; i < 10; i++) {
    const list = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${address}"`)}&limit=1`)).json();
    const match = /(\d{6})/.exec(list.messages?.[0]?.Subject || "");
    if (match) return match[1];
    await new Promise((r) => setTimeout(r, 500));
  }
  return null;
};
const login = async (address) => {
  const req = await post("/api/login/email/request", { email: address });
  if (req.status !== 200) return { status: req.status, body: req.body };
  const code = await codeFor(address);
  const ver = await post("/api/login/email/verify", { email: address, code });
  return { status: ver.status, cookie: ver.cookie, body: ver.body };
};

await mongoose.connect(process.env.MONGO_URI);
await fetch(`${MAILPIT}/api/v1/messages`, { method: "DELETE" });
await Voter.deleteMany({ email: { $exists: true } });
await Team.deleteMany({});
const team = await Team.create({ teamName: "OpenTeam", state: "voting", presenting: true });
await GeofenceSettings.updateOne({ key: "venue" }, { $set: { enabled: false } }, { upsert: true });
await updateLoginSettings({ open: true, anyEmail: true });
await new Promise((r) => setTimeout(r, 3500));

const first = await login("New.Student@gmail.com");
check("anyone mode: unlisted email gets a code and logs in", first.status === 201, `status ${first.status}`);
check("voter created automatically", (await Voter.countDocuments({ email: "newstudent@gmail.com" })) === 1);
const vote1 = await post(`/api/vote/${team._id}`, { vote: "yes" }, first.cookie);
check("that voter can vote", vote1.status === 200);

const alias = await login("newstudent+second@gmail.com");
check("gmail +alias logs in as the SAME voter", alias.status === 201 && (await Voter.countDocuments({ email: { $exists: true } })) === 1);
const vote2 = await post(`/api/vote/${team._id}`, { vote: "no" }, alias.cookie);
check("alias cannot vote a second time", vote2.status === 400 && /already voted/i.test(vote2.body.message || ""), vote2.body.message);
check("code was sent to the address as typed", Boolean(await codeFor("newstudent+second@gmail.com")));

const temp = await post("/api/login/email/request", { email: "someone@yopmail.com" });
check("temporary inbox refused", temp.status === 400 && temp.body.code === "DISPOSABLE_EMAIL", temp.body.message);

await updateLoginSettings({ anyEmail: false });
await new Promise((r) => setTimeout(r, 3500));
const unlisted = await post("/api/login/email/request", { email: "stranger@gmail.com" });
check("list mode: unlisted email refused", unlisted.status === 403 && unlisted.body.code === "NOT_ON_LIST");
const relog = await post("/api/login/email/request", { email: "new.student@gmail.com" });
check("list mode: an existing voter can still log in", relog.status === 200 || relog.status === 429, `status ${relog.status}`);

await updateLoginSettings({ anyEmail: true, open: false });
await mongoose.disconnect();
console.log(`SUMMARY ${results.filter(Boolean).length}/${results.length} passed`);
process.exit(0);
