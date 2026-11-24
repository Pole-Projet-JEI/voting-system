import assert from "node:assert/strict";
import { test } from "node:test";
import { pickWinner, remainingEmails } from "../src/raffle/raffle-api.mjs";

test("previous winners leave the game; duplicates and empty emails are ignored", () => {
  assert.deepEqual(
    remainingEmails(["b@x.co", "a@x.co", "c@x.co", "a@x.co", null, ""], ["c@x.co"]),
    ["a@x.co", "b@x.co"]
  );
});

test("a winner is always taken from the remaining pool", () => {
  const pool = ["a@x.co", "b@x.co", "c@x.co"];
  assert.equal(pickWinner(pool, () => 0), "a@x.co");
  assert.equal(pickWinner(pool, () => 2), "c@x.co");
  for (let i = 0; i < 200; i += 1) assert.ok(pool.includes(pickWinner(pool)));
});

test("empty pool gives no winner", () => {
  assert.equal(pickWinner([]), null);
});

test("every email wins exactly once over successive rounds", () => {
  const emails = Array.from({ length: 50 }, (_, i) => `v${i}@x.co`);
  const winners = [];
  for (;;) {
    const winner = pickWinner(remainingEmails(emails, winners));
    if (!winner) break;
    assert.ok(!winners.includes(winner));
    winners.push(winner);
  }
  assert.equal(winners.length, 50);
});

test("the draw is roughly uniform", () => {
  const pool = ["a", "b", "c", "d"];
  const counts = Object.fromEntries(pool.map((p) => [p, 0]));
  for (let i = 0; i < 8000; i += 1) counts[pickWinner(pool)] += 1;
  for (const p of pool) assert.ok(counts[p] > 1700 && counts[p] < 2300, JSON.stringify(counts));
});
