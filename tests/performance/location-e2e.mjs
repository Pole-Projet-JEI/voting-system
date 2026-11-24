// Browser checks for the voter location flow, against the isolated test copy
// (http://localhost:3092 through an SSH tunnel). Location is scripted: each
// page gets a fake navigator.geolocation; every watchPosition call plays the
// next queued list of readings (r.atMs, or 200 ms apart) and every call is
// logged. Needs: playwright-core, /usr/bin/google-chrome, OUT=<screenshot dir>.
// Test data expected: team "Alpha" voting, geofence at CENTER, radius 70 m,
// max GPS error 60 m, login open.
import { chromium } from "playwright-core";
import { execFileSync } from "node:child_process";

const BASE = process.env.BASE || "http://localhost:3092";
const OUT = process.env.OUT || ".";
const CENTER = { lat: 36.842563, lng: 10.19751 };
const at = (m, accuracy, extra = {}) => ({ latitude: CENTER.lat + m / 111195, longitude: CENTER.lng, accuracy, ...extra });

const UA = {
  iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
  android: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
  windows: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
};
const ssh = (cmd) => execFileSync("ssh", ["voting-jei", cmd], { encoding: "utf8" }).trim();
const mongo = (js) => ssh(`cd ~/apps/voting-loadtest && docker compose -p voting-loadtest exec -T mongo mongosh --quiet voting_loadtest --eval '${js}'`);

const FAKE_GEO = () => {
  window.__watchQueue = [];
  window.__getQueue = [];
  window.__geoLog = [];
  const cleared = new Set();
  const emit = (ok, fail, r) =>
    r.error
      ? fail({ code: r.error, message: "fake" })
      : ok({ coords: { latitude: r.latitude, longitude: r.longitude, accuracy: r.accuracy }, timestamp: Date.now() - (r.ageMs || 0) });
  const geo = {
    watchPosition(ok, fail, options) {
      const list = window.__watchQueue.shift() || [{ error: 3 }];
      const id = Math.random();
      window.__geoLog.push({ kind: "watch", options, readings: list });
      list.forEach((r, i) => setTimeout(() => { if (!cleared.has(id)) emit(ok, fail, r); }, r.atMs ?? 200 * (i + 1)));
      return id;
    },
    clearWatch(id) { cleared.add(id); },
    getCurrentPosition(ok, fail, options) {
      const r = window.__getQueue.shift() || { error: 2 };
      window.__geoLog.push({ kind: "get", options, reading: r });
      setTimeout(() => emit(ok, fail, r), 100);
    },
  };
  Object.defineProperty(navigator, "geolocation", { value: geo, configurable: true });
};

const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", headless: true });
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};
const text = async (p) => (await p.locator("body").innerText()).replace(/\s+/g, " ").trim();
const settle = async (p) => {
  await p.waitForTimeout(150);
  await p.waitForFunction(() => !/Vérification de votre position|Envoi…/.test(document.body.innerText), null, { timeout: 45000 });
  await p.waitForTimeout(400);
};
const open = async (kind) => {
  const mobile = kind !== "windows";
  const ctx = await browser.newContext({
    userAgent: UA[kind],
    viewport: mobile ? { width: 390, height: 844 } : { width: 1366, height: 768 },
    isMobile: mobile,
    hasTouch: mobile,
  });
  ctx.setDefaultNavigationTimeout(90000);
  await ctx.addInitScript(FAKE_GEO);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/register`);
  await page.waitForURL(/\/home/, { timeout: 30000 });
  await page.waitForFunction(() => /Autoriser la position|Envoyer mon vote/.test(document.body.innerText), null, { timeout: 30000 });
  return page;
};
const queue = (p, watch = [], get = []) => p.evaluate(([w, g]) => { window.__watchQueue.push(...w); window.__getQueue.push(...g); }, [watch, get]);
const allow = async (p, watch, get = []) => {
  await queue(p, [watch], get);
  await p.click("button.location-step-button");
  await settle(p);
};
const submit = async (p, watch, get = []) => {
  await queue(p, [watch], get);
  await p.click("#vote-yes");
  await p.click("button.submit-vote-button");
  await settle(p);
};
const shot = async (p, name) => {
  await p.waitForTimeout(300);
  const box = await p.locator(".fie-panel").first().boundingBox();
  const vp = p.viewportSize();
  const m = 16;
  const x = Math.max(0, box.x - m);
  const y = Math.max(0, box.y - m);
  await p.screenshot({ path: `${OUT}/${name}.png`, clip: { x, y, width: Math.min(vp.width - x, box.width + 2 * m), height: box.height + 2 * m } });
};

let t;
try {
  // Field report (Android indoors on 4G): rough cell position first, precise later.
  const indoor = await open("android");
  const t0 = Date.now();
  await allow(indoor, [{ ...at(400, 2000), atMs: 300 }, { ...at(150, 1400), atMs: 1500 }, { ...at(15, 18), atMs: 7000 }]);
  t = await text(indoor);
  check("field case: ±2000 m first, precise fix at 7 s → location accepted, no 'approximate' error",
    /Envoyer mon vote/.test(t) && !/approximative/.test(t), `${Math.round((Date.now() - t0) / 1000)} s`);
  await shot(indoor, "field-indoor-precise-later");
  await submit(indoor, [{ ...at(300, 1800), atMs: 300 }, { ...at(20, 22), atMs: 5000 }]);
  check("field case: vote with rough-then-precise readings is accepted", /Merci pour votre vote/.test(await text(indoor)));

  // 1. iPhone
  const ios = await open("iphone");
  t = await text(ios);
  check("1. iPhone: location step with 'Allow location' shown first", /Vérification de la position/.test(t) && /Autoriser la position/.test(t) && !/Envoyer mon vote/.test(t));
  await ios.click("button.location-step-button");
  await ios.waitForTimeout(50);
  check("1. iPhone: the tap itself starts the location request", (await ios.evaluate(() => window.__geoLog[0]?.kind)) === "watch");
  const iosDenied = await open("iphone");
  await allow(iosDenied, [{ error: 1 }]);
  t = await text(iosDenied);
  check("1. iPhone blocked: iPhone settings path, no 'lock icon'", /Réglages → Confidentialité et sécurité → Service de localisation/.test(t) && !/icône/.test(t));
  await allow(iosDenied, [at(10, 15)]);
  t = await text(iosDenied);
  check("1. iPhone: after allowing, Try again unlocks the vote form", /Envoyer mon vote/.test(t), /Envoyer mon vote/.test(t) ? "" : t.slice(0, 160) + " | geo: " + JSON.stringify(await iosDenied.evaluate(() => window.__geoLog.map((g) => g.kind + ":" + JSON.stringify(g.readings || g.reading)))));

  // 2. Approximate / Windows
  const andApprox = await open("android");
  const t1 = Date.now();
  await allow(andApprox, [at(5, 2000), { ...at(5, 2100), atMs: 3000 }]);
  t = await text(andApprox);
  check("2. Approximate only (no precise fix in 20 s): steps + measured ±2000 m + Wi-Fi tip",
    /approximative/.test(t) && /±2000 m/.test(t) && /Wi-Fi/.test(t) && /Utiliser la position exacte/.test(t), `${Math.round((Date.now() - t1) / 1000)} s`);
  await shot(andApprox, "field-approximate-after-20s");
  const winApprox = await open("windows");
  await allow(winApprox, [{ error: 3 }], [at(5, 2000)]);
  t = await text(winApprox);
  check("2. Windows approximate: Windows Location services + Wi-Fi, advises phone", /Paramètres Windows/.test(t) && /Wi-Fi/.test(t) && /téléphone/.test(t));
  const winDenied = await open("windows");
  await allow(winDenied, [{ error: 1 }]);
  check("2. Windows blocked: Windows-specific steps", /Autoriser les applications de bureau/.test(await text(winDenied)));

  // 3. Radius / jitter / cache
  const inside = await open("android");
  await allow(inside, [at(20, 15)]);
  await submit(inside, [at(78, 48), at(34, 14)]);
  check("3. Inside voter, noisy first reading → best reading used → accepted", /Merci pour votre vote/.test(await text(inside)));
  const outside = await open("android");
  await allow(outside, [at(118, 12)]);
  await submit(outside, [at(65, 55), at(118, 12)]);
  check("3. Outside voter, one lucky reading → best reading used → refused", /hors de la salle/.test(await text(outside)));
  const stale = await open("android");
  await allow(stale, [at(10, 20)]);
  await submit(stale, [{ error: 3 }], [at(5, 30, { ageMs: 55000 })]);
  t = await text(stale);
  const log = await stale.evaluate(() => window.__geoLog.slice(-2).map((g) => g.options?.maximumAge));
  check("3. Old cached position (55 s) refused by the server", /ancienne position/.test(t) && !/Merci/.test(t));
  check("3. Every location request uses maximumAge 0", log.every((v) => v === 0), JSON.stringify(log));

  // 4. Messages
  const msg = await open("android");
  await allow(msg, [at(12, 10)]);
  await msg.waitForSelector("button.submit-vote-button", { timeout: 15000 });
  t = await text(msg);
  check("4. Vote page: no 'vote for all teams' sentence", !/toutes les \d+ équipes|aucun de vos votes|comptent seulement/i.test(t));
  await submit(msg, [at(12, 10)]);
  t = await text(msg);
  check("4. Thank-you page: only 'Thank you for your vote'", /Merci pour votre vote/.test(t) && !/sur \d+ équipes|comptent seulement/i.test(t));
} catch (error) {
  check("run completed", false, error.message.split("\n")[0]);
} finally {
  await browser.close();
}

console.log("STORED " + mongo('db.voters.find().toArray().flatMap(v=>Object.values(v.votes||{}).map(x=>x.vote+" d="+x.distanceMeters+" acc="+x.accuracyMeters)).join(" | ")'));
console.log(`SUMMARY ${results.filter((r) => r.ok).length}/${results.length}`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
