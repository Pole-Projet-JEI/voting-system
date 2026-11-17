// End-to-end browser test against the isolated test copy (http://localhost:3092
// through an SSH tunnel). Admin and voter run in separate browser contexts.
import { chromium } from "playwright-core";
import { execFileSync } from "node:child_process";

const BASE = "http://localhost:3092";
const ADMIN = "/jvaFHT7xvivJPJqc1QBRWhfayoj";
const VENUE = { latitude: 36.842563, longitude: 10.19751 };
const FAR = { latitude: 36.86, longitude: 10.2 }; // ~2 km away
const VOTER = "browser.tester@loadtest.example";
const OUT = process.env.OUT;

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};
const ssh = (cmd) =>
  execFileSync("ssh", ["-o", "ConnectTimeout=15", "voting-jei", cmd], { encoding: "utf8" }).trim();
const mongo = (js) =>
  ssh(`cd ~/apps/voting-loadtest && docker compose -p voting-loadtest exec -T mongo mongosh --quiet voting_loadtest --eval '${js}'`);
const latestCode = (email) => {
  const out = ssh(
    `docker exec voting-loadtest-backend1-1 node -e 'fetch("http://mailpit:8025/api/v1/search?query=to:${email}&limit=1").then(r=>r.json()).then(j=>console.log(j.messages?.[0]?.Subject||""))'`
  );
  return /(\d{6})/.exec(out)?.[1];
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const textOf = async (page) => (await page.locator("body").innerText()).replace(/\s+/g, " ");
const waitText = async (page, re, timeout = 20000) => {
  try {
    await page.waitForFunction((src) => new RegExp(src, "i").test(document.body.innerText), re.source, { timeout });
    return true;
  } catch {
    return false;
  }
};

const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", headless: true });
const consoleErrors = [];
const watch = (page, who) => {
  page.on("pageerror", (e) => consoleErrors.push(`${who}: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource|ERR_CONNECTION|502|503|504|EventSource/i.test(m.text())) {
      consoleErrors.push(`${who}: ${m.text().slice(0, 160)}`);
    }
  });
};

try {
  // ---------- admin ----------
  const adminCtx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, permissions: ["geolocation"], geolocation: VENUE });
  const admin = await adminCtx.newPage();
  watch(admin, "admin");
  await admin.goto(`${BASE}${ADMIN}/login`);
  await admin.fill('input[placeholder="Admin username"]', "admin");
  await admin.fill('input[placeholder="Enter admin secret key"]', process.env.ADMIN_PW);
  await admin.click('button[type="submit"]');
  await admin.waitForURL(/dashboard/, { timeout: 15000 });
  await waitText(admin, /Voting Dashboard/);
  const mustChange = await admin.locator("#current-admin-password").waitFor({ timeout: 5000 }).then(() => true, () => false);
  if (mustChange) {
    await admin.fill("#current-admin-password", process.env.ADMIN_PW);
    await admin.fill("#new-admin-password", "E2e-Admin-2026!x");
    await admin.fill("#confirm-admin-password", "E2e-Admin-2026!x");
    await admin.click('button:has-text("Save password")');
    await admin.locator("#current-admin-password").waitFor({ state: "detached", timeout: 10000 });
  }
  check("admin can log in (incl. first-login password change)", /Voting Dashboard/.test(await textOf(admin)));

  let t = await textOf(admin);
  check("dashboard shows Voters & Login, Venue Location Check, Official results",
    /Voters & Login/.test(t) && /Venue Location Check/.test(t) && /Official results/.test(t));
  check("login shows Closed by default", /Login Closed/.test(t));
  check("location check shows Enforced", /Status Enforced/.test(t));

  await admin.fill('textarea[placeholder^="Paste emails"]', "Ali <ali.e2e@loadtest.example>; sara.e2e@loadtest.example\nbad-entry");
  await admin.click('button:has-text("Add 2")');
  check("pasting emails imports only valid ones", await waitText(admin, /2 added/));

  await admin.click('button:has-text("Show QR code")');
  const qr = admin.locator('img[alt^="QR code for"]');
  await qr.waitFor({ timeout: 10000 });
  const qrAlt = await qr.getAttribute("alt");
  check("QR code screen shows the voting link", qrAlt.includes(`${BASE}/register`), qrAlt);
  await admin.screenshot({ path: `${OUT}/admin-qr.png` });
  await admin.click('button[aria-label="Close QR code"]');

  // ---------- voter (phone) ----------
  const voterCtx = await browser.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    permissions: ["geolocation"], geolocation: VENUE,
  });
  const voter = await voterCtx.newPage();
  watch(voter, "voter");
  await voter.goto(`${BASE}/register`);
  check("voter sees 'login is closed' before admin opens it", await waitText(voter, /Login is closed/));
  await voter.screenshot({ path: `${OUT}/voter-login-closed.png` });

  await admin.click('button:has-text("Open login")');
  check("admin opens login", await waitText(admin, /Login is open/));
  check("voter page unlocks by itself", await waitText(voter, /Enter your email|You will receive/, 15000));

  await voter.fill('input[type="email"]', "stranger@evil.example");
  await voter.click('button[aria-label="Send code"]');
  check("email not on the list is refused", await waitText(voter, /not on the voter list/));

  await voter.fill('input[type="email"]', VOTER);
  await voter.click('button[aria-label="Send code"]');
  check("listed email gets the code step", await waitText(voter, /We sent a 6-digit code/));
  await sleep(1500);
  const code = latestCode(VOTER);
  check("code email arrives", Boolean(code));
  await voter.fill('input[name="one-time-code"]', code === "000000" ? "111111" : "000000");
  await voter.click('button[aria-label="Verify code"]');
  check("wrong code is refused", await waitText(voter, /Wrong code/));
  await voter.fill('input[name="one-time-code"]', code);
  await voter.click('button[aria-label="Verify code"]');
  await voter.waitForURL(/\/home/, { timeout: 15000 }).catch(() => {});
  check("correct code logs the voter in", voter.url().endsWith("/home"), voter.url());
  check("voter waits while no team presents", await waitText(voter, /get ready for the next team/));

  // Round 1: Alpha
  await admin.locator('div:has(> div > h3:text-is("Alpha")), :text-is("Alpha")').first().waitFor();
  const presentButtons = admin.locator('button:has-text("Present")');
  await presentButtons.first().click();
  check("voter sees the team presenting (live update)", await waitText(voter, /Alpha is presenting/, 15000));
  await admin.click('button:has-text("Start Voting")');
  check("voter sees the vote form when voting opens", await waitText(voter, /Your vote for Alpha/, 15000));
  check("voter is reminded to vote for all teams", await waitText(voter, /Vote for all 2 teams/, 5000));

  await voterCtx.setGeolocation({ ...FAR, accuracy: 20 });
  await voter.click("#vote-yes");
  await voter.click('button:has-text("Submit Vote")');
  check("vote from 2 km away is refused", await waitText(voter, /outside the venue/));
  await voter.screenshot({ path: `${OUT}/voter-outside.png` });

  await voterCtx.setGeolocation({ ...VENUE, accuracy: 20 });
  await voter.click('button:has-text("Submit Vote")');
  check("vote from inside the room is accepted", await waitText(voter, /Thank you for your vote/));
  check("thank-you shows progress 1 of 2", await waitText(voter, /voted for 1 of 2 teams/, 8000));
  await voter.screenshot({ path: `${OUT}/voter-thanks-1of2.png` });

  check("admin sees the vote count live", await waitText(admin, /Voting is open/) && /Yes\s*1/i.test(await textOf(admin)));
  await admin.click('button:has-text("End")');
  await sleep(1500);
  check("voter sees voting closed after End", await waitText(voter, /get ready for the next team/, 15000));

  // Round 2: Beta, with the server down at submit time
  await admin.locator('button:has-text("Present")').first().click();
  await sleep(1000);
  await admin.click('button:has-text("Start Voting")');
  check("voter sees Beta voting", await waitText(voter, /Your vote for Beta/, 15000));
  await voter.click("#vote-no");
  ssh("docker stop -t 2 voting-loadtest-backend1-1 >/dev/null");
  await voter.click('button:has-text("Submit Vote")');
  check("server down: voter still sees thank you", await waitText(voter, /Thank you for your vote/, 30000));
  const pending = await voter.evaluate(() => localStorage.getItem("voting.pendingVote"));
  check("server down: vote kept on the phone for retry", Boolean(pending));
  ssh("docker start voting-loadtest-backend1-1 >/dev/null");
  let stored = false;
  for (let i = 0; i < 20 && !stored; i++) {
    await sleep(3000);
    stored = /^1$/.test(mongo('const b=db.teams.findOne({teamName:"Beta"}); print(db.voters.countDocuments({["votes."+b._id]:{$exists:true}}))'));
  }
  check("server back: retried vote is stored", stored);
  check("pending vote cleared after retry", !(await voter.evaluate(() => localStorage.getItem("voting.pendingVote"))));

  await admin.reload();
  await admin.waitForSelector("text=Official results", { timeout: 20000 });
  await sleep(2000);
  t = await textOf(admin);
  check("official results count the complete voter", /Complete voters \(counted\)\s*1/.test(t), t.match(/Teams counted[^A-Z]*\d+ \/ \d+/)?.[0]);
  await admin.screenshot({ path: `${OUT}/admin-dashboard.png`, fullPage: true });

  // Close login: a second voter is blocked
  await admin.click('button:has-text("Close login")');
  check("admin closes login", await waitText(admin, /Login is closed/));
  const late = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await late.goto(`${BASE}/register`);
  check("new voter is blocked after login closes", await waitText(late, /Login is closed/, 15000));
  check("logged-in voter is still logged in", (await voter.evaluate(() => fetch("/api/isconnected").then((r) => r.json()))).connected === true);

  check("no unexpected console errors", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | "));
} catch (error) {
  check("test run completed", false, error.message.split("\n")[0]);
} finally {
  await browser.close();
  console.log(`SUMMARY ${results.filter((r) => r.ok).length}/${results.length} passed`);
}
