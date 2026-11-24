// Browser checks for ACCESS_MODE=qr-email (vote.jeinsat.com or a test copy).
// Needs: playwright-core, /usr/bin/google-chrome, OUT=<screenshot dir>,
// ADMIN_USER / ADMIN_PASS (read from the server, never printed).
// Creates a team "QR test", opens login and voting; the caller cleans up.
import { chromium } from "playwright-core";

const BASE = process.env.BASE || "https://vote.jeinsat.com";
const OUT = process.env.OUT || ".";
const ADMIN = "/jvaFHT7xvivJPJqc1QBRWhfayoj";
const EMAIL = `qr.test.${Date.now()}@example.com`;
// UI_LANG=fr for the French build (vote.jeinsat.com).
const FR = process.env.UI_LANG === "fr";
const L = (en, fr) => (FR ? fr : en);
const MOBILE = {
  userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
};

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok: Boolean(ok) });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};
const text = async (p) => (await p.locator("body").innerText()).replace(/\s+/g, " ").trim();
const waitText = (p, re, timeout = 20000) =>
  p.waitForFunction((src) => new RegExp(src).test(document.body.innerText), re.source, { timeout }).then(() => true, () => false);

const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", headless: true });
try {
  // ---- admin: login, team, voting, login window ----
  const admin = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const api = admin.request;
  const login = await api.post(`${BASE}/api/admin/login`, { data: { username: process.env.ADMIN_USER, secretKey: process.env.ADMIN_PASS } });
  check("admin can log in", login.ok(), String(login.status()));
  const team = await (await api.post(`${BASE}/api/admin/team`, { data: { teamName: "QR test", description: "e2e" } })).json();
  const teamId = team.team?._id || team._id || team.data?._id;
  await api.post(`${BASE}/api/admin/presenting`, { data: { teamId } });
  await api.post(`${BASE}/api/admin/presenting/voting`);
  await api.put(`${BASE}/api/admin/login-window`, { data: { open: true } });
  const qr = await (await api.get(`${BASE}/api/admin/access-qr`)).json();
  check("admin gets a QR link that rotates every 25 s", qr.open && qr.periodSeconds === 25 && /^\/join\?t=\d+-/.test(qr.path), qr.path);

  // ---- 1. plain link without QR ----
  const plain = await (await browser.newContext(MOBILE)).newPage();
  await plain.goto(`${BASE}/register`);
  check("1. opening the site without the QR asks to scan the QR code", await waitText(plain, L(/scan the QR code shown on the screen/, /scannez le QR code affiché à l'écran/)));
  await plain.screenshot({ path: `${OUT}/qr-1-no-qr.png` });

  // ---- 2. scan, wait past the code's life, then type the email ----
  const v1 = await (await browser.newContext(MOBILE)).newPage();
  await v1.goto(`${BASE}${qr.path}`);
  check("2. scanning shows the email form", await waitText(v1, L(/Your email/, /Votre adresse e-mail/)));
  check("2. the token is removed from the address after scanning", !/t=/.test(v1.url()), v1.url());
  await v1.screenshot({ path: `${OUT}/qr-2-email-form.png` });

  // A photo of the same code, opened 36 s later, is refused.
  await v1.waitForTimeout(36_000);
  const late = await (await browser.newContext(MOBILE)).newPage();
  await late.goto(`${BASE}${qr.path}`);
  check("3. the same QR opened 36 s later is refused (expired)", await waitText(late, L(/expired/, /a expiré/)));
  await late.screenshot({ path: `${OUT}/qr-3-expired.png` });

  // v1 typed slowly: the 10-minute pass still lets them in.
  await v1.fill("#voter-email", "not-an-email");
  await v1.click("button.join-email-submit");
  check("4. an invalid email is refused", await waitText(v1, L(/valid email/, /adresse e-mail valide/)));
  await v1.fill("#voter-email", `  ${EMAIL.toUpperCase()} `);
  await v1.click("button.join-email-submit");
  check("4. 36 s after scanning, typing the email still works (10-min pass)", await waitText(v1, L(/Submit Vote/, /Envoyer mon vote/)), await text(v1).then((t) => t.slice(0, 80)));
  await v1.screenshot({ path: `${OUT}/qr-4-vote-form.png` });
  check("4. no location step in this mode", !L(/Location check/, /Vérification de la position/).test(await text(v1)));
  await v1.click("#vote-yes");
  await v1.click("button.submit-vote-button");
  check("5. the vote is accepted", await waitText(v1, L(/Thank you for your vote/, /Merci pour votre vote/)));
  await v1.screenshot({ path: `${OUT}/qr-5-thanks.png` });

  // ---- 6. no pass: /join directly ----
  const nopass = await (await browser.newContext(MOBILE)).newPage();
  await nopass.goto(`${BASE}/join`);
  await waitText(nopass, L(/Your email/, /Votre adresse e-mail/));
  await nopass.fill("#voter-email", "someone@example.com");
  await nopass.click("button.join-email-submit");
  check("6. typing an email without scanning is refused", await waitText(nopass, L(/Scan the QR code/, /Scannez le QR code/)));

  // ---- 7. same email on a second phone = same voter ----
  const qr2 = await (await api.get(`${BASE}/api/admin/access-qr`)).json();
  const v2 = await (await browser.newContext(MOBILE)).newPage();
  await v2.goto(`${BASE}${qr2.path}`);
  await waitText(v2, L(/Your email/, /Votre adresse e-mail/));
  await v2.fill("#voter-email", EMAIL);
  await v2.click("button.join-email-submit");
  check("7. same email on another phone: already voted, cannot vote twice", await waitText(v2, L(/Thank you for your vote/, /Merci pour votre vote/)), await text(v2).then((t) => t.slice(0, 80)));

  // ---- 8. admin list ----
  const list = await (await api.get(`${BASE}/api/admin/voters`)).json();
  const mine = list.voters.filter((v) => v.email === EMAIL.toLowerCase());
  check("8. admin list: one voter for that email, 1/1 team", mine.length === 1 && mine[0].teamsVoted === 1 && list.totalTeams === 1, JSON.stringify(mine));
  check("8. the email typed without scanning was not recorded", !list.voters.some((v) => v.email === "someone@example.com"));

  // Test browser only: hide the first-login password dialog.
  await admin.route("**/api/admin/auth", async (route) => {
    const r = await route.fetch();
    const j = await r.json();
    j.mustChangePassword = false;
    await route.fulfill({ response: r, json: j });
  });

  // ---- 10. emails page ----
  const emails = await admin.newPage();
  await emails.goto(`${BASE}${ADMIN}/emails`);
  check("10. emails page lists the typed email", await waitText(emails, new RegExp(EMAIL.toLowerCase().replace(/\./g, "\\."))));
  const et = await text(emails);
  check("10. emails page marks it counted (voted for every team)", L(/Counted/, /Compté/).test(et) && /1\/1/.test(et), et.slice(0, 200));
  check("10. emails page has no unscanned email", !/someone@example\.com/.test(et));
  await emails.fill("input[type=search]", "zzz-nothing");
  check("10. search filters the list", await waitText(emails, L(/No email matches/, /Aucun e-mail ne correspond/)));
  await emails.fill("input[type=search]", "");
  const [download] = await Promise.all([emails.waitForEvent("download"), emails.click(`text=${L("Download CSV", "Télécharger CSV")}`)]);
  const csv = await (await import("node:fs")).promises.readFile(await download.path(), "utf8");
  check("10. CSV export contains the email and 'counted'", csv.includes(EMAIL.toLowerCase()) && /"yes"/.test(csv), csv.split("\n")[1]);
  await emails.screenshot({ path: `${OUT}/qr-10-emails.png`, fullPage: true });
  const anon = await (await browser.newContext()).request.get(`${BASE}/api/admin/voters`);
  check("10. emails API refuses non-admins", anon.status() === 401 || anon.status() === 403, String(anon.status()));

  const dash = await admin.newPage();
  await dash.goto(`${BASE}${ADMIN}/dashboard`);
  check("9. dashboard shows the per-email table", await waitText(dash, new RegExp(EMAIL.toLowerCase().replace(/\./g, "\\."))));
  await dash.locator("text=Voters & Login").scrollIntoViewIfNeeded();
  await dash.screenshot({ path: `${OUT}/qr-9-dashboard.png`, fullPage: true });
  await dash.click("text=Show QR code");
  check("9. projector QR shows the countdown", await waitText(dash, L(/New code in \d+s/, /Nouveau code dans \d+ s/)));
  await dash.waitForTimeout(800);
  await dash.screenshot({ path: `${OUT}/qr-9-projector.png` });
} catch (error) {
  check("run completed", false, error.message.split("\n")[0]);
} finally {
  await browser.close();
}

console.log(`SUMMARY ${results.filter((r) => r.ok).length}/${results.length}`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
