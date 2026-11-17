import { chromium } from "playwright-core";
const BASE = "http://localhost:3092", ADMIN = "/jvaFHT7xvivJPJqc1QBRWhfayoj";
const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome", headless: true });
const open = async (opts) => {
  const ctx = await b.newContext({ viewport: { width: 1366, height: 768 }, ...opts });
  const p = await ctx.newPage();
  await p.goto(`${BASE}${ADMIN}/login`);
  await p.fill('input[placeholder="Admin username"]', "admin");
  await p.fill('input[placeholder="Enter admin secret key"]', "E2e-Admin-2026!x");
  await p.click('button[type="submit"]');
  await p.waitForURL(/dashboard/);
  await p.waitForFunction(() => /Venue Location Check/.test(document.body.innerText));
  await p.waitForTimeout(800);
  return p;
};
const lat = (p) => p.locator('input[placeholder^="36.843200"]').inputValue();
const lng = (p) => p.locator('input[placeholder="10.197100"]').inputValue();

// 1. permission allowed
let p = await open({ permissions: ["geolocation"], geolocation: { latitude: 36.8501, longitude: 10.2002, accuracy: 35 } });
await p.click('button:has-text("Use my current location")');
await p.waitForFunction(() => /Fix accuracy/.test(document.body.innerText), null, { timeout: 20000 }).catch(() => {});
console.log((await lat(p)) === "36.850100" && (await lng(p)) === "10.200200" ? "PASS" : "FAIL", "allowed: fills coordinates", await lat(p), await lng(p));

// 2. permission blocked
p = await open({ permissions: [] });
await p.context().clearPermissions();
await p.evaluate(() => {
  navigator.geolocation.getCurrentPosition = (ok, fail) => setTimeout(() => fail({ code: 1 }), 50);
});
await p.click('button:has-text("Use my current location")');
const blocked = await p.waitForFunction(() => /Location access is blocked/.test(document.body.innerText), null, { timeout: 10000 }).then(() => true, () => false);
console.log(blocked ? "PASS" : "FAIL", "blocked: explains how to re-allow, inside the panel");
await p.screenshot({ path: "shots/location-blocked.png", clip: { x: 0, y: 0, width: 330, height: 768 } });

// 3. laptop without GPS: precise fix times out, normal location answers
await p.evaluate(() => {
  navigator.geolocation.getCurrentPosition = (ok, fail, o) =>
    setTimeout(() => (o.enableHighAccuracy ? fail({ code: 3 }) : ok({ coords: { latitude: 36.8444, longitude: 10.1999, accuracy: 80 } })), 50);
});
await p.click('button:has-text("Use my current location")');
await p.waitForFunction(() => /Fix accuracy: ±80/.test(document.body.innerText), null, { timeout: 10000 }).catch(() => {});
console.log((await lat(p)) === "36.844400" ? "PASS" : "FAIL", "no GPS: falls back to normal location", await lat(p));

// 4. paste from Google Maps
await p.locator('input[placeholder^="36.843200"]').fill("36.842563, 10.197510");
console.log((await lat(p)) === "36.842563" && (await lng(p)) === "10.19751" ? "PASS" : "FAIL", "paste 'lat, lng' fills both", await lat(p), await lng(p));
await b.close();
