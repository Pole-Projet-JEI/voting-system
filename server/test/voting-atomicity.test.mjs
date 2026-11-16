import assert from "node:assert/strict";
import { test } from "node:test";
import mongoose from "mongoose";
import Team from "../src/mongodb/teamSchema.mjs";
import Voter from "../src/mongodb/voterSchema.mjs";
import votingRouter from "../src/vote/voting.mjs";

const teamId = "507f1f77bcf86cd799439011";

const voteHandler = votingRouter.stack
  .find((entry) => entry.route?.path === "/api/vote/:id")
  .route.stack.at(-1).handle;

const createResponse = () => ({
  statusCode: 200,
  body: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  },
});

const createSession = (events) => ({
  async withTransaction(callback) {
    events.push("start");
    try {
      const result = await callback();
      events.push("commit");
      return result;
    } catch (error) {
      events.push("abort");
      throw error;
    }
  },
  async endSession() {
    events.push("end");
  },
});

const withMocks = async (mocks, callback) => {
  const originals = new Map();
  for (const [object, methods] of mocks) {
    for (const [name, implementation] of Object.entries(methods)) {
      originals.set(`${object.modelName ?? "mongoose"}:${name}`, object[name]);
      object[name] = implementation;
    }
  }

  try {
    await callback();
  } finally {
    for (const [object, methods] of mocks) {
      for (const name of Object.keys(methods)) {
        originals.forEach((original, key) => {
          if (key === `${object.modelName ?? "mongoose"}:${name}`) {
            object[name] = original;
          }
        });
      }
    }
  }
};

const presentingTeamQuery = () => ({
  lean: async () => ({ _id: teamId }),
});

const createRequest = (vote = "yes") => ({
  params: { id: teamId },
  body: { vote },
  voter: { _id: "voter-id" },
});

test("a valid vote commits voter and team updates in one transaction", async () => {
  const events = [];
  let voterOptions;
  let voterUpdate;
  let teamUpdate;
  let teamOptions;

  await withMocks(
    [
      [mongoose, { startSession: async () => createSession(events) }],
      [Team, {
        findOne: () => presentingTeamQuery(),
        updateOne: async (_filter, update, options) => {
          teamUpdate = update;
          teamOptions = options;
          return { matchedCount: 1 };
        },
      }],
      [Voter, {
        findOneAndUpdate: async (_filter, update, options) => {
          voterUpdate = update;
          voterOptions = options;
          return { _id: "voter-id", votes: new Map() };
        },
      }],
    ],
    async () => {
      const res = createResponse();
      await voteHandler(createRequest(), res);

      assert.equal(res.statusCode, 200);
      assert.equal(res.body.voted, true);
      assert.equal(voterOptions.session, teamOptions.session);
      assert.equal(voterUpdate.$set[`votes.${teamId}`].vote, "yes");
      assert.equal(teamUpdate.$inc.nyes, 1);
      assert.deepEqual(events, ["start", "commit", "end"]);
    }
  );
});

test("a voter update failure does not update the team", async () => {
  const events = [];
  let teamUpdated = false;

  await withMocks(
    [
      [mongoose, { startSession: async () => createSession(events) }],
      [Team, {
        findOne: () => presentingTeamQuery(),
        updateOne: async () => {
          teamUpdated = true;
          return { matchedCount: 1 };
        },
      }],
      [Voter, {
        findOneAndUpdate: async () => null,
        findById: async () => null,
      }],
    ],
    async () => {
      const res = createResponse();
      await voteHandler(createRequest(), res);

      assert.equal(res.statusCode, 404);
      assert.equal(teamUpdated, false);
      assert.deepEqual(events, ["start", "abort", "end"]);
    }
  );
});

test("a team update failure aborts the voter update transaction", async () => {
  const events = [];
  let voterUpdated = false;

  await withMocks(
    [
      [mongoose, { startSession: async () => createSession(events) }],
      [Team, {
        findOne: () => presentingTeamQuery(),
        updateOne: async () => ({ matchedCount: 0 }),
      }],
      [Voter, {
        findOneAndUpdate: async () => {
          voterUpdated = true;
          return { _id: "voter-id", votes: new Map() };
        },
      }],
    ],
    async () => {
      const res = createResponse();
      await voteHandler(createRequest(), res);

      assert.equal(res.statusCode, 500);
      assert.equal(voterUpdated, true);
      assert.deepEqual(events, ["start", "abort", "end"]);
    }
  );
});

test("concurrent requests can commit only one vote", async () => {
  const events = [];
  let claimed = false;
  let teamUpdates = 0;

  await withMocks(
    [
      [mongoose, { startSession: async () => createSession(events) }],
      [Team, {
        findOne: () => presentingTeamQuery(),
        updateOne: async () => {
          teamUpdates += 1;
          return { matchedCount: 1 };
        },
      }],
      [Voter, {
        findOneAndUpdate: async () => {
          if (claimed) return null;
          claimed = true;
          return { _id: "voter-id", votes: new Map() };
        },
        findById: async () => ({ votes: new Map([[teamId, { vote: "yes" }]]) }),
      }],
    ],
    async () => {
      const responses = await Promise.all(
        [createRequest(), createRequest()].map((request) => {
          const res = createResponse();
          return voteHandler(request, res).then(() => res);
        })
      );

      assert.equal(responses.filter((res) => res.statusCode === 200).length, 1);
      assert.equal(responses.filter((res) => res.statusCode === 400).length, 1);
      assert.equal(responses.find((res) => res.statusCode === 400).body.existingVote, "yes");
      assert.equal(teamUpdates, 1);
    }
  );
});

test("multiple voters update persisted vote records and team totals once each", async () => {
  const persistedVotes = new Map();
  const teamTotals = { nyes: 0, nno: 0 };
  const requests = [
    { ...createRequest("yes"), voter: { _id: "voter-1" } },
    { ...createRequest("no"), voter: { _id: "voter-2" } },
    { ...createRequest("yes"), voter: { _id: "voter-3" } },
    { ...createRequest("no"), voter: { _id: "voter-4" } },
    { ...createRequest("yes"), voter: { _id: "voter-5" } },
  ];

  await withMocks(
    [
      [mongoose, { startSession: async () => createSession([]) }],
      [Team, {
        findOne: () => presentingTeamQuery(),
        updateOne: async (_filter, update) => {
          teamTotals.nyes += update.$inc.nyes ?? 0;
          teamTotals.nno += update.$inc.nno ?? 0;
          return { matchedCount: 1 };
        },
      }],
      [Voter, {
        findOneAndUpdate: async (filter, update) => {
          const voter = filter._id;
          if (persistedVotes.has(voter)) return null;
          const value = update.$set[`votes.${teamId}`];
          persistedVotes.set(voter, value);
          return { _id: voter, votes: new Map([[teamId, value]]) };
        },
        findById: async (voter) => ({
          votes: persistedVotes.has(voter)
            ? new Map([[teamId, persistedVotes.get(voter)]])
            : new Map(),
        }),
      }],
    ],
    async () => {
      const responses = await Promise.all(requests.map(async (request) => {
        const response = createResponse();
        await voteHandler(request, response);
        return response;
      }));

      assert.equal(responses.filter((response) => response.statusCode === 200).length, 5);
      assert.equal(persistedVotes.size, 5);
      assert.equal(teamTotals.nyes, [...persistedVotes.values()].filter((entry) => entry.vote === "yes").length);
      assert.equal(teamTotals.nno, [...persistedVotes.values()].filter((entry) => entry.vote === "no").length);
      assert.equal(teamTotals.nyes + teamTotals.nno, persistedVotes.size);
    }
  );
});

test("transient conflict retries the whole transaction without double counting", async () => {
  let callbackAttempts = 0;
  let voteRegistrations = 0;
  let nyes = 0;
  const transient = new Error("write conflict");
  transient.errorLabels = ["TransientTransactionError"];

  await withMocks(
    [
      [mongoose, { startSession: async () => ({
        async withTransaction(callback) {
          for (;;) {
            callbackAttempts += 1;
            try {
              const result = await callback();
              return result;
            } catch (error) {
              if (!error.hasErrorLabel?.("TransientTransactionError")) throw error;
            }
          }
        },
        async endSession() {},
      }) }],
      [Team, {
        findOne: () => presentingTeamQuery(),
        updateOne: async () => {
          if (callbackAttempts === 1) throw transient;
          nyes += 1;
          return { matchedCount: 1 };
        },
      }],
      [Voter, {
        findOneAndUpdate: async () => {
          voteRegistrations += 1;
          return { _id: "voter-id", votes: new Map() };
        },
      }],
    ],
    async () => {
      transient.hasErrorLabel = (label) => transient.errorLabels.includes(label);
      const res = createResponse();
      await voteHandler(createRequest(), res);

      assert.equal(res.statusCode, 200);
      assert.equal(callbackAttempts, 2);
      assert.equal(voteRegistrations, 2, "registration is repeated as part of the full retry");
      assert.equal(nyes, 1, "only the successful transaction contributes to the counter");
    }
  );
});

test("permanent transaction errors are not retried and client details stay hidden", async () => {
  let callbackAttempts = 0;
  const permanent = new Error("private database detail");

  await withMocks(
    [
      [mongoose, { startSession: async () => ({
        async withTransaction(callback) {
          callbackAttempts += 1;
          return callback();
        },
        async endSession() {},
      }) }],
      [Team, { findOne: () => presentingTeamQuery(), updateOne: async () => { throw permanent; } }],
      [Voter, { findOneAndUpdate: async () => ({ _id: "voter-id", votes: new Map() }) }],
    ],
    async () => {
      const res = createResponse();
      await voteHandler(createRequest(), res);
      assert.equal(res.statusCode, 500);
      assert.equal(callbackAttempts, 1);
      assert.equal("error" in res.body, false);
      assert.equal(JSON.stringify(res.body).includes("private database detail"), false);
    }
  );
});

test("a nonexistent or ineligible team does not consume a ballot", async () => {
  const events = [];
  let voterUpdateAttempted = false;

  await withMocks(
    [
      [mongoose, { startSession: async () => createSession(events) }],
      [Team, {
        findOne: () => ({ lean: async () => null }),
      }],
      [Voter, {
        findOneAndUpdate: async () => {
          voterUpdateAttempted = true;
          return null;
        },
      }],
    ],
    async () => {
      const res = createResponse();
      await voteHandler(createRequest(), res);

      assert.equal(res.statusCode, 400);
      assert.equal(voterUpdateAttempted, false);
      assert.deepEqual(events, ["start", "abort", "end"]);
    }
  );
});
