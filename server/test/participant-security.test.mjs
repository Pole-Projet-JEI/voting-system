import assert from "node:assert/strict";
import { test } from "node:test";
import mongoose from "mongoose";
import Voter from "../src/mongodb/voterSchema.mjs";
import Team from "../src/mongodb/teamSchema.mjs";
import registerRouter from "../src/register/register.mjs";
import { requireAuth } from "../src/middleware/auth-cookie.mjs";
import votingRouter from "../src/vote/voting.mjs";
import { hashVoterCode } from "../src/mongodb/voter-code.mjs";

const teamId = "507f1f77bcf86cd799439011";
const participantToken = "a".repeat(64);

const getRouteHandler = (router, path) => {
  const layer = router.stack.find((entry) => entry.route?.path === path);
  return layer.route.stack.at(-1).handle;
};

const registerHandler = getRouteHandler(registerRouter, "/api/register");
const voteHandlers = (() => {
  const layer = votingRouter.stack.find(
    (entry) => entry.route?.path === "/api/vote/:id"
  );
  return layer.route.stack.map((entry) => entry.handle);
})();

const createResponse = () => ({
  statusCode: 200,
  body: null,
  cookieValue: null,
  cookieOptions: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  },
  cookie(name, value, options) {
    assert.equal(name, "connectionCookie");
    this.cookieValue = value;
    this.cookieOptions = options;
    return this;
  },
});

const withModelMocks = async (mocks, callback) => {
  const originals = new Map();
  for (const [model, methods] of mocks) {
    for (const [name, implementation] of Object.entries(methods)) {
      originals.set(`${model.modelName}:${name}`, model[name]);
      model[name] = implementation;
    }
  }

  try {
    await callback();
  } finally {
    for (const [model, methods] of mocks) {
      for (const name of Object.keys(methods)) {
        model[name] = originals.get(`${model.modelName}:${name}`);
      }
    }
  }
};

test("valid registration creates a signed opaque participant session", async () => {
  const voter = {
    save: async () => {},
  };

  await withModelMocks(
    [[Voter, { findOne: async (filter) => {
      assert.deepEqual(filter, {
        codeHash: hashVoterCode("fA7S59MVX"),
      });
      return voter;
    } }]],
    async () => {
      const res = createResponse();
      await registerHandler({ body: { code: "fA7S59MVX" } }, res);

      assert.equal(res.statusCode, 201);
      assert.equal(typeof res.cookieValue, "string");
      assert.equal(res.cookieValue.length, 64);
      assert.equal(res.cookieOptions.signed, true);
      assert.notEqual(voter.participantSessionHash, "fA7S59MVX");
    }
  );
});

test("registration rejects NoSQL operator payloads before querying", async () => {
  let queried = false;

  await withModelMocks(
    [[Voter, { findOne: async () => {
      queried = true;
      return null;
    } }]],
    async () => {
      const res = createResponse();
      await registerHandler({ body: { code: { $ne: null } } }, res);

      assert.equal(res.statusCode, 400);
      assert.equal(queried, false);
      assert.equal(res.cookieValue, null);
    }
  );
});

test("missing, forged, and malformed participant cookies are rejected", async () => {
  let queried = false;
  await withModelMocks(
    [[Voter, { findOne: async () => {
      queried = true;
      return null;
    } }]],
    async () => {
      for (const signedCookies of [
        {},
        { connectionCookie: false },
        { connectionCookie: { code: { $ne: null } } },
      ]) {
        const res = createResponse();
        let nextCalled = false;
        await requireAuth(
          { cookies: {}, signedCookies },
          res,
          () => {
            nextCalled = true;
          }
        );
        assert.equal(res.statusCode, 401);
        assert.equal(nextCalled, false);
      }
      assert.equal(queried, false);
    }
  );
});

test("a valid participant session authenticates and records one vote", async () => {
  const voter = { _id: "voter-id", code: "fA7S59MVX", votes: new Map() };
  let updatedFilter;
  let teamUpdated = false;

  await withModelMocks(
    [
      [Voter, {
        findOne: async () => voter,
        findOneAndUpdate: async (filter) => {
          updatedFilter = filter;
          return voter;
        },
      }],
      [Team, {
        findOne: () => ({ lean: async () => ({ _id: teamId }) }),
        updateOne: async () => {
          teamUpdated = true;
        },
      }],
    ],
    async () => {
      const req = {
        params: { id: teamId },
        body: { vote: "yes" },
        signedCookies: { connectionCookie: participantToken },
      };
      const res = createResponse();
      let nextCalled = false;

      await voteHandlers[0](req, res, () => {
        nextCalled = true;
      });
      await voteHandlers[1](req, res);

      assert.equal(nextCalled, true);
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.voted, true);
      assert.deepEqual(updatedFilter._id, voter._id);
      assert.equal("code" in updatedFilter, false);
      assert.equal(teamUpdated, true);
    }
  );
});

test("an unauthenticated request cannot consume a voter ballot", async () => {
  let ballotUpdateAttempted = false;

  await withModelMocks(
    [[Voter, {
      findOne: async () => null,
      findOneAndUpdate: async () => {
        ballotUpdateAttempted = true;
      },
    }]],
    async () => {
      const req = { params: { id: teamId }, body: { vote: "yes" } };
      const res = createResponse();
      let nextCalled = false;

      await voteHandlers[0](req, res, () => {
        nextCalled = true;
      });

      assert.equal(res.statusCode, 401);
      assert.equal(nextCalled, false);
      assert.equal(ballotUpdateAttempted, false);
    }
  );
});

test("reusing a consumed ballot is rejected", async () => {
  const voter = {
    _id: "voter-id",
    code: "fA7S59MVX",
    votes: new Map([[teamId, { vote: "yes" }]]),
  };

  await withModelMocks(
    [
      [Voter, {
        findOne: async () => voter,
        findOneAndUpdate: async () => null,
        findById: async () => voter,
      }],
      [Team, {
        findOne: () => ({ lean: async () => ({ _id: teamId }) }),
      }],
    ],
    async () => {
      const req = {
        params: { id: teamId },
        body: { vote: "no" },
        signedCookies: { connectionCookie: participantToken },
      };
      const res = createResponse();

      await voteHandlers[0](req, res, () => {
        req.authenticated = true;
      });
      await voteHandlers[1](req, res);

      assert.equal(res.statusCode, 400);
      assert.equal(res.body.voted, false);
      assert.equal(res.body.message, "You have already voted for this team");
    }
  );
});

test("invalid team IDs are rejected before database access", async () => {
  const res = createResponse();
  await voteHandlers[1](
    { params: { id: { $ne: null } }, body: { vote: "yes" }, voter: { _id: "voter-id" } },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.voted, false);
  assert.equal(mongoose.isValidObjectId(teamId), true);
});
