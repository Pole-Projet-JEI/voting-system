import assert from "node:assert/strict";
import { test } from "node:test";

// rankTeams lives in a .jsx file; load just the function body for a quick check.
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("../src/components/adminComponents/OfficialResultsPanel.jsx", import.meta.url), "utf8");
const body = src.slice(src.indexOf("export const rankTeams"), src.indexOf("const MEDALS"));
const rankTeams = new Function(`${body.replace("export const rankTeams", "const rankTeams")}; return rankTeams;`)();

const team = (teamName, yes, no) => ({ teamName, official: { yes, no } });

test("teams are ordered by counted yes votes", () => {
  const ranked = rankTeams([team("A", 3, 1), team("B", 9, 0), team("C", 5, 2)]);
  assert.deepEqual(ranked.map((t) => `${t.rank}:${t.teamName}`), ["1:B", "2:C", "3:A"]);
});

test("a tie on yes is broken by fewer no votes", () => {
  const ranked = rankTeams([team("A", 5, 3), team("B", 5, 1)]);
  assert.deepEqual(ranked.map((t) => `${t.rank}:${t.teamName}`), ["1:B", "2:A"]);
});

test("fully equal teams share a place and the next place is skipped", () => {
  const ranked = rankTeams([team("A", 4, 1), team("B", 4, 1), team("C", 2, 0)]);
  assert.deepEqual(ranked.map((t) => `${t.rank}:${t.teamName}:${t.tied}`), ["1:A:true", "1:B:true", "3:C:false"]);
});
