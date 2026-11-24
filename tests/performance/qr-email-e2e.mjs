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
// Slow test links: give every page load up to 2 minutes.
const plainNewContext = browser.newContext.bind(browser);
browser.newContext = async (options) => {
  const context = await plainNewContext(options);
  context.setDefaultNavigationTimeout(120000);
  return context;
};
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
  check("admin gets a QR link that rotates every 15 s", qr.open && qr.periodSeconds === 15 && /^\/join\?t=\d+-/.test(qr.path), qr.path);

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

  // A photo of the same code, opened 36 s later (15 s + 20 s grace), is refused.
  await v1.waitForTimeout(36_000);
  const late = await (await browser.newContext(MOBILE)).newPage();
  await late.goto(`${BASE}${qr.path}`);
  check("3. the same QR opened 36 s later asks to scan again", await waitText(late, L(/Scan the QR code shown on the screen again/, /Scannez à nouveau le QR code/)));
  check("3. no 'expired' wording and no red error", !L(/expired/i, /expiré/i).test(await text(late)) && !(await late.locator(".fie-error").count()));
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

  // ---- 7. same email typed by someone else = refused ----
  // Load the site once first: on a slow test link the cold page load alone can
  // outlast the code; a real phone does this in a few seconds.
  const v2 = await (await browser.newContext(MOBILE)).newPage();
  await v2.goto(`${BASE}/register`);
  await waitText(v2, L(/scan the QR code/, /scannez le QR code/));
  const qr2 = await (await api.get(`${BASE}/api/admin/access-qr`)).json();
  await v2.goto(`${BASE}${qr2.path}`);
  await waitText(v2, L(/Your email/, /Votre adresse e-mail/));
  await v2.fill("#voter-email", EMAIL);
  await v2.click("button.join-email-submit");
  check("7. same email on another phone is refused", await waitText(v2, L(/already been used/, /déjà été utilisée/)), await text(v2).then((t) => t.slice(0, 120)));
  check("7. the other phone stays on the email form (no vote page)", !L(/Submit Vote/, /Envoyer mon vote/).test(await text(v2)));
  await v2.screenshot({ path: `${OUT}/qr-7-email-taken.png` });
  await v1.reload();
  check("7. the first phone is still logged in (not kicked out)", await waitText(v1, L(/Thank you for your vote/, /Merci pour votre vote/)));

  // 5 phones type the same new email at the same instant: only one gets in.
  const RACE = `race.${Date.now()}@example.com`;
  const qr3 = await (await api.get(`${BASE}/api/admin/access-qr`)).json();
  const phones = await Promise.all([1, 2, 3, 4, 5].map(async () => {
    const ctx = await browser.newContext(MOBILE);
    await ctx.request.post(`${BASE}/api/join/scan`, { data: { t: new URL(`${BASE}${qr3.path}`).searchParams.get("t") } });
    return ctx;
  }));
  const raced = await Promise.all(phones.map((ctx) => ctx.request.post(`${BASE}/api/join`, { data: { email: RACE } })));
  const codes = raced.map((r) => r.status()).sort();
  check("7. same email at the same instant on 5 phones: 1 accepted, 4 refused", codes.join(",") === "201,409,409,409,409", codes.join(","));

  // ---- 8. admin list ----
  const list = await (await api.get(`${BASE}/api/admin/voters`)).json();
  const mine = list.voters.filter((v) => v.email === EMAIL.toLowerCase());
  check("8. admin list: one voter for that email, 1/1 team", mine.length === 1 && mine[0].teamsVoted === 1 && list.totalTeams === 1, JSON.stringify(mine));
  check("8. the email typed without scanning was not recorded", !list.voters.some((v) => v.email === "someone@example.com"));
  check("8. the raced email exists once", list.voters.filter((v) => v.email === RACE).length === 1);

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
  await dash.locator(`text=${L("Voters & Login", "Votants et connexion")}`).scrollIntoViewIfNeeded();
  await dash.screenshot({ path: `${OUT}/qr-9-dashboard.png`, fullPage: true });
  const [qrTab] = await Promise.all([admin.waitForEvent("page"), dash.click(`text=${L("Show QR code", "Afficher le QR code")}`)]);
  check("9. 'Afficher le QR code' opens a new tab", /\/qr$/.test(qrTab.url()) || (await qrTab.waitForURL(/\/qr$/).then(() => true, () => false)), qrTab.url());
  await qrTab.waitForSelector("img[alt^='QR code']", { timeout: 60000 });
  await qrTab.waitForTimeout(800);
  check("9. the new tab shows only the QR code, no countdown text", !/Nouveau code dans|New code in/.test(await text(qrTab)));
  check("9. the dashboard stays open in its own tab", /\/dashboard$/.test(dash.url()));
  await qrTab.screenshot({ path: `${OUT}/qr-9-projector.png` });
  const [rafTab] = await Promise.all([admin.waitForEvent("page"), dash.click(`text=${L("Draw game", "Tirage au sort")}`)]);
  check("9. 'Tirage au sort' opens a new tab", await rafTab.waitForURL(/\/tirage$/).then(() => true, () => false), rafTab.url());
  check("9. the raffle tab loads", await waitText(rafTab, L(/Draw a winner/, /Tirer un gagnant/), 60000));

  // ---- 11. admin session ----
  const cookie = (await admin.cookies()).find((c) => c.name === "adminToken");
  check("11. admin cookie lasts 24 h and is SameSite=Lax", cookie && cookie.sameSite === "Lax" && cookie.expires * 1000 - Date.now() > 23 * 3600 * 1000, `${cookie?.sameSite} ${cookie && Math.round((cookie.expires * 1000 - Date.now()) / 3600000)}h`);
  const fresh = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  await fresh.route("**/api/admin/auth", async (route) => {
    const r = await route.fetch();
    const j = await r.json();
    j.mustChangePassword = false;
    await route.fulfill({ response: r, json: j });
  });
  const lp = await fresh.newPage();
  await lp.goto(`${BASE}${ADMIN}/qr`);
  check("11. opening the QR tab while logged out asks to log in", await lp.waitForURL(/\/login\?next=/).then(() => true, () => false), lp.url());
  await lp.fill("#username", process.env.ADMIN_USER);
  await lp.fill("#secretKey", process.env.ADMIN_PASS);
  await lp.click("button[type=submit]");
  check("11. after logging in it goes back to the QR tab", await lp.waitForURL(/\/qr$/, { timeout: 60000 }).then(() => true, () => false), lp.url());
  const lp2 = await fresh.newPage();
  await lp2.goto(`${BASE}${ADMIN}/dashboard`);
  await lp2.waitForTimeout(2000);
  check("11. a new tab stays logged in (session kept)", /\/dashboard$/.test(lp2.url()), lp2.url());

  // ---- 12. public projector screen /qr/<key>, no login ----
  await dash.bringToFront();
  await dash.reload();
  const link = await dash.locator("[data-testid=public-screen] a").getAttribute("href", { timeout: 60000 });
  check("12. dashboard shows the public screen link", /\/qr\/[A-Za-z0-9]{10}$/.test(link || ""), link);
  const pub = await (await browser.newContext({ viewport: { width: 1366, height: 900 } })).newPage();
  await pub.goto(link.replace(/^https?:\/\/[^/]+/, BASE));
  check("12. the public screen shows the QR without logging in", await pub.waitForSelector("img[alt^='QR code']", { timeout: 60000 }).then(() => true, () => false) && !/\/login/.test(pub.url()), pub.url());
  await pub.screenshot({ path: `${OUT}/qr-12-public-screen.png` });
  const key = link.split("/").pop();
  const pubQr = await (await (await browser.newContext()).request.get(`${BASE}/api/screen/${key}`)).json();
  const scanCtx = await browser.newContext(MOBILE);
  const scanRes = await scanCtx.request.post(`${BASE}/api/join/scan`, { data: { t: new URL(`${BASE}${pubQr.path}`).searchParams.get("t") } });
  check("12. the public screen's QR code lets a phone in", scanRes.ok(), String(scanRes.status()));
  const bad = await (await browser.newContext()).newPage();
  await bad.goto(`${BASE}/qr/AAAAAAAAAA`);
  check("12. a wrong key shows 'lien non valide' and no QR", await waitText(bad, /lien d'écran n'est pas valide/) && !(await bad.locator("img[alt^='QR code']").count()));
  await dash.click("text=Changer le lien");
  await dash.click("text=Oui, changer");
  await dash.waitForFunction((old) => document.querySelector("[data-testid=public-screen] a")?.getAttribute("href") !== old, link, { timeout: 20000 });
  const oldRes = await (await browser.newContext()).request.get(`${BASE}/api/screen/${key}`);
  check("12. after 'Changer le lien' the old link stops working", oldRes.status() === 404, String(oldRes.status()));
  check("12. the open public screen switches to 'lien non valide'", await waitText(pub, /lien d'écran n'est pas valide/, 30000));
} catch (error) {
  check("run completed", false, error.message.split("\n")[0]);
  for (const [i, pg] of browser.contexts().flatMap((c) => c.pages()).entries()) {
    await pg.screenshot({ path: `${OUT}/fail-${i}.png` }).catch(() => {});
  }
} finally {
  for (const context of browser.contexts()) await context.unrouteAll({ behavior: "ignoreErrors" }).catch(() => {});
  await browser.close();
}

console.log(`SUMMARY ${results.filter((r) => r.ok).length}/${results.length}`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
