import assert from "node:assert/strict";
import { test } from "node:test";
import { tallyOfficialResults } from "../src/admin/services/officialResultsService.mjs";

const teams = ["t1", "t2", "t3", "t4"].map((id, index) => ({
  _id: id,
  teamName: `Team ${index + 1}`,
  state: "ended",
  nyes: 10,
  nno: 5,
}));

const ballot = (choices) => ({
  votes: Object.fromEntries(
    Object.entries(choices).map(([id, vote]) => [id, { vote, votedAt: new Date() }])
  ),
});

test("only voters who voted for every team are counted", () => {
  const voters = [
    ballot({ t1: "yes", t2: "yes", t3: "no", t4: "yes" }), // complete
    ballot({ t1: "no", t2: "no", t3: "no", t4: "no" }), // complete
    ballot({ t1: "yes", t2: "yes", t3: "yes" }), // missed t4: discarded
    ballot({ t2: "no" }), // discarded
  ];

  const result = tallyOfficialResults(teams, voters);

  assert.equal(result.countedTeams, 4);
  assert.equal(result.completeVoters, 2);
  assert.equal(result.votersWithAnyVote, 4);
  assert.equal(result.discardedVoters, 2);
  assert.deepEqual(result.teams[0].official, { yes: 1, no: 1 });
  assert.deepEqual(result.teams[2].official, { yes: 0, no: 2 });
  assert.deepEqual(result.teams[0].raw, { yes: 10, no: 5 });
});

test("works with Mongoose Map votes", () => {
  const voter = {
    votes: new Map([
      ["t1", { vote: "yes" }],
      ["t2", { vote: "no" }],
    ]),
  };
  const result = tallyOfficialResults(teams.slice(0, 2), [voter]);
  assert.equal(result.completeVoters, 1);
  assert.deepEqual(result.teams[1].official, { yes: 0, no: 1 });
});

test("no counted teams means no complete voters", () => {
  const result = tallyOfficialResults([], [ballot({ t1: "yes" })]);
  assert.equal(result.completeVoters, 0);
  assert.equal(result.teams.length, 0);
});
