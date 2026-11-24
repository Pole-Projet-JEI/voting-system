// Browser checks for the admin draw game (/tirage), French build.
// Expects a test copy with exactly 5 voter emails and no previous draws.
// Needs: playwright-core, /usr/bin/google-chrome, OUT, ADMIN_USER, ADMIN_PASS.
import { chromium } from "playwright-core";

const BASE = process.env.BASE || "http://localhost:3092";
const OUT = process.env.OUT || ".";
const PAGE = "/jvaFHT7xvivJPJqc1QBRWhfayoj/tirage";

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok: Boolean(ok) });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};
const text = async (p) => (await p.locator("body").innerText()).replace(/\s+/g, " ").trim();
const waitText = (p, re, timeout = 15000) =>
  p.waitForFunction((src) => new RegExp(src).test(document.body.innerText), re.source, { timeout }).then(() => true, () => false);

const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", headless: true });
try {
  const admin = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const api = admin.request;
  check("admin can log in", (await api.post(`${BASE}/api/admin/login`, { data: { username: process.env.ADMIN_USER, secretKey: process.env.ADMIN_PASS } })).ok());
  await admin.route("**/api/admin/auth", async (route) => {
    const r = await route.fetch();
    const j = await r.json();
    j.mustChangePassword = false;
    await route.fulfill({ response: r, json: j });
  });

  const anon = await (await browser.newContext()).request.get(`${BASE}/api/admin/raffle`);
  check("non-admins cannot see or draw", [401, 403].includes(anon.status()), String(anon.status()));

  // Two draws at the same instant (double click): two different rounds and emails.
  const [a, b] = await Promise.all([api.post(`${BASE}/api/admin/raffle/draw`), api.post(`${BASE}/api/admin/raffle/draw`)]);
  const wa = (await a.json()).winner;
  const wb = (await b.json()).winner;
  check("two simultaneous draws give two rounds and two different emails",
    a.ok() && b.ok() && wa.round !== wb.round && wa.email !== wb.email, `${wa?.round}:${wa?.email} ${wb?.round}:${wb?.email}`);
  await api.delete(`${BASE}/api/admin/raffle`);

  const p = await admin.newPage();
  p.setDefaultNavigationTimeout(120000); // slow links: the page bundle is ~370 kB
  await p.goto(`${BASE}${PAGE}`);
  check("page in French with 5 emails in the game", await waitText(p, /Tirage au sort/) && await waitText(p, /5 en jeu/));
  await p.screenshot({ path: `${OUT}/raffle-0-start.png` });

  const winners = [];
  for (let round = 1; round <= 5; round += 1) {
    await p.click(`text=${round === 1 ? "Tirer un gagnant" : "Tour suivant"}`);
    if (round === 1) {
      await p.waitForTimeout(900);
      check("the box spins through emails while drawing", /Tirage…/.test(await text(p)));
      await p.screenshot({ path: `${OUT}/raffle-1-spinning.png` });
    }
    const ok = await waitText(p, new RegExp(`Gagnant du tour ${round}`), 15000);
    const shown = await p.locator("[data-testid=raffle-display]").innerText();
    if (round === 1) {
      check("round 1: the winner's full email is shown", ok && /^[a-z.]+@example\.com$/.test(shown), shown);
      await p.screenshot({ path: `${OUT}/raffle-2-winner.png` });
      winners.push(shown);
    } else {
      const state = await (await api.get(`${BASE}/api/admin/raffle`)).json();
      winners.push(state.winners.find((w) => w.round === round)?.email);
    }
    const state = await (await api.get(`${BASE}/api/admin/raffle`)).json();
    check(`round ${round}: previous winners left the game (${5 - round} left)`,
      state.remaining === 5 - round && !state.pool.some((e) => winners.includes(e)), `left=${state.remaining}`);
  }
  check("5 rounds gave 5 different winners", new Set(winners).size === 5, winners.join(", "));
  check("game empty: button disabled with a message",
    await waitText(p, /Plus aucun e-mail en jeu/) && (await p.locator("button:has-text('Tour suivant')").isDisabled()));
  await p.screenshot({ path: `${OUT}/raffle-4-all-drawn.png`, fullPage: true });

  await p.reload();
  check("after reload the winners are still there (stored on the server)", await waitText(p, /Tour 5/) && await waitText(p, /0 en jeu/));

  const voters = await (await api.get(`${BASE}/api/admin/voters`)).json();
  check("voters are not deleted (still 5 emails)", voters.voters.filter((v) => v.email).length === 5);

  await p.click("text=Recommencer");
  check("'Start over' asks for confirmation", await waitText(p, /Remettre tous les e-mails en jeu/));
  await p.click("text=Oui, recommencer");
  check("after 'Start over' every email is back", await waitText(p, /5 en jeu/) && await waitText(p, /Aucun gagnant/));
} catch (error) {
  check("run completed", false, error.message.split("\n")[0]);
} finally {
  await browser.close();
}

console.log(`SUMMARY ${results.filter((r) => r.ok).length}/${results.length}`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
