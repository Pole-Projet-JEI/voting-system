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
  startTransaction() {
    events.push("start");
  },
  async commitTransaction() {
    events.push("commit");
  },
  async abortTransaction() {
    events.push("abort");
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
        findById: async () => ({ votes: new Map() }),
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
      assert.equal(responses.filter((res) => res.statusCode === 404).length, 1);
      assert.equal(teamUpdates, 1);
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
