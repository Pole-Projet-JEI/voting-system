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

const noSession = async () => {
  throw new Error("votes must not use multi-document transactions");
};

test("a valid vote stores the ballot then increments the team counter, without a transaction", async () => {
  const order = [];
  let voterFilter;
  let voterUpdate;
  let teamUpdate;

  await withMocks(
    [
      [mongoose, { startSession: noSession }],
      [Team, {
        findOne: () => presentingTeamQuery(),
        updateOne: async (_filter, update) => {
          order.push("team");
          teamUpdate = update;
          return { matchedCount: 1 };
        },
      }],
      [Voter, {
        findOneAndUpdate: async (filter, update) => {
          order.push("voter");
          voterFilter = filter;
          voterUpdate = update;
          return { _id: "voter-id" };
        },
      }],
    ],
    async () => {
      const res = createResponse();
      await voteHandler(createRequest(), res);

      assert.equal(res.statusCode, 200);
      assert.equal(res.body.voted, true);
      assert.deepEqual(order, ["voter", "team"]);
      assert.deepEqual(voterFilter[`votes.${teamId}`], { $exists: false });
      assert.equal(voterUpdate.$set[`votes.${teamId}`].vote, "yes");
      assert.equal(teamUpdate.$inc.nyes, 1);
    }
  );
});

test("an unknown voter does not update the team", async () => {
  let teamUpdated = false;

  await withMocks(
    [
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
    }
  );
});

test("a counter failure still confirms the stored ballot", async () => {
  const originalError = console.error;
  console.error = () => {};
  try {
    await withMocks(
      [
        [Team, {
          findOne: () => presentingTeamQuery(),
          updateOne: async () => {
            throw new Error("counter down");
          },
        }],
        [Voter, { findOneAndUpdate: async () => ({ _id: "voter-id" }) }],
      ],
      async () => {
        const res = createResponse();
        await voteHandler(createRequest(), res);
        assert.equal(res.statusCode, 200);
        assert.equal(res.body.voted, true);
      }
    );
  } finally {
    console.error = originalError;
  }
});

test("concurrent requests can store only one vote", async () => {
  let claimed = false;
  let teamUpdates = 0;

  await withMocks(
    [
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
          return { _id: "voter-id" };
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
  const requests = ["yes", "no", "yes", "no", "yes"].map((vote, index) => ({
    ...createRequest(vote),
    voter: { _id: `voter-${index + 1}` },
  }));

  await withMocks(
    [
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
          persistedVotes.set(voter, update.$set[`votes.${teamId}`]);
          return { _id: voter };
        },
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
      assert.equal(teamTotals.nyes, 3);
      assert.equal(teamTotals.nno, 2);
    }
  );
});

test("database errors return 500 without leaking details", async () => {
  const originalError = console.error;
  console.error = () => {};
  try {
    await withMocks(
      [
        [Team, { findOne: () => presentingTeamQuery() }],
        [Voter, {
          findOneAndUpdate: async () => {
            throw new Error("private database detail");
          },
        }],
      ],
      async () => {
        const res = createResponse();
        await voteHandler(createRequest(), res);
        assert.equal(res.statusCode, 500);
        assert.equal(JSON.stringify(res.body).includes("private database detail"), false);
      }
    );
  } finally {
    console.error = originalError;
  }
});

test("a nonexistent or ineligible team does not consume a ballot", async () => {
  let voterUpdateAttempted = false;

  await withMocks(
    [
      [Team, { findOne: () => ({ lean: async () => null }) }],
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
    }
  );
});
