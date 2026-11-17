// Layout audit: every screen at many viewport sizes. Reports horizontal
// overflow, content clipped below the fold when the page cannot scroll, and
// controls that end up out of view.
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:3092";
const ADMIN = "/jvaFHT7xvivJPJqc1QBRWhfayoj";
const OUT = process.env.OUT || "shots/layout";
mkdirSync(OUT, { recursive: true });
const [CODE_A, CODE_B] = process.env.CODES.split(",");

const VIEWPORTS = [
  [320, 568, true], [360, 640, true], [390, 844, true], [412, 915, true],
  [768, 1024, true], [1024, 768, false], [1280, 600, false], [1280, 720, false],
  [1366, 768, false], [1440, 900, false], [1920, 1080, false],
];

const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", headless: true });

// Sessions: A has not voted (vote form), B has voted (thank-you).
const login = async (code) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/register`);
  const status = await page.evaluate(
    (c) => fetch("/api/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: c }) }).then((r) => r.status),
    code
  );
  if (status !== 201) throw new Error(`login ${code} -> ${status}`);
  return { state: await ctx.storageState(), ctx, page };
};
const a = await login(CODE_A);
const b = await login(CODE_B);
const team = await b.page.evaluate(() => fetch("/api/currentteam").then((r) => r.json()));
await b.page.evaluate((id) => fetch(`/api/vote/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ vote: "yes" }) }), team.teamID);

const adminCtx = await browser.newContext();
const adminPage = await adminCtx.newPage();
await adminPage.goto(`${BASE}${ADMIN}/login`);
await adminPage.fill('input[placeholder="Admin username"]', "admin");
await adminPage.fill('input[placeholder="Enter admin secret key"]', "E2e-Admin-2026!x");
await adminPage.click('button[type="submit"]');
await adminPage.waitForURL(/dashboard/);
const adminState = await adminCtx.storageState();

const SCREENS = [
  { name: "login", path: "/register", ready: /You will receive a 6-digit code/, state: undefined },
  { name: "vote", path: "/home", ready: /Your vote for/, state: a.state },
  { name: "thanks", path: "/home", ready: /Thank you for your vote/, state: b.state },
  { name: "admin-login", path: `${ADMIN}/login`, ready: /Admin Login/, state: undefined },
  { name: "admin", path: `${ADMIN}/dashboard`, ready: /Voting Dashboard/, state: adminState },
];

const measure = () => {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const scrollers = [...document.querySelectorAll("*")].filter((el) => {
    const cs = getComputedStyle(el);
    return /(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1;
  });
  const canScrollPage =
    document.scrollingElement.scrollHeight > vh + 1 && getComputedStyle(document.body).overflow !== "hidden";
  const insideScroller = (el) => scrollers.some((s) => s.contains(el));
  const problems = [];
  if (document.documentElement.scrollWidth > vw + 1) {
    problems.push(`page is ${document.documentElement.scrollWidth}px wide (> ${vw})`);
  }
  for (const el of document.querySelectorAll("button, input, textarea, h1, h2, h3, p, img, label, table")) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none") continue;
    const label = `${el.tagName.toLowerCase()} "${(el.innerText || el.placeholder || el.alt || "").trim().slice(0, 30)}"`;
    if (r.right > vw + 1 && !insideScroller(el)) problems.push(`${label} sticks out right (${Math.round(r.right)} > ${vw})`);
    if (r.left < -1) problems.push(`${label} sticks out left (${Math.round(r.left)})`);
    if (r.bottom > vh + 1 && !canScrollPage && !insideScroller(el)) problems.push(`${label} cut off below (${Math.round(r.bottom)} > ${vh})`);
    if (r.top < -1 && !canScrollPage && !insideScroller(el)) problems.push(`${label} cut off above (${Math.round(r.top)})`);
  }
  return [...new Set(problems)];
};

const report = [];
for (const screen of SCREENS) {
  for (const [w, h, mobile] of VIEWPORTS) {
    const ctx = await browser.newContext({
      viewport: { width: w, height: h }, isMobile: mobile, hasTouch: mobile, storageState: screen.state,
    });
    const page = await ctx.newPage();
    await page.goto(`${BASE}${screen.path}`);
    try {
      await page.waitForFunction((src) => new RegExp(src).test(document.body.innerText), screen.ready.source, { timeout: 15000 });
    } catch {
      report.push({ screen: screen.name, size: `${w}x${h}`, problems: ["screen did not load"] });
      await ctx.close();
      continue;
    }
    await page.waitForTimeout(600);
    const problems = await page.evaluate(measure);
    await page.screenshot({ path: `${OUT}/${screen.name}-${w}x${h}.png` });
    report.push({ screen: screen.name, size: `${w}x${h}`, problems });
    await ctx.close();
  }
}

for (const r of report) {
  console.log(`${r.problems.length ? "FAIL" : "ok  "} ${r.screen.padEnd(12)} ${r.size.padEnd(10)} ${r.problems.slice(0, 4).join("; ")}${r.problems.length > 4 ? ` (+${r.problems.length - 4} more)` : ""}`);
}
console.log(`SUMMARY ${report.filter((r) => !r.problems.length).length}/${report.length} screen sizes OK`);
await browser.close();
