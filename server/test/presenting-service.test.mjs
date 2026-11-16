import assert from "node:assert/strict";
import { test } from "node:test";
import mongoose from "mongoose";
import Team from "../src/mongodb/teamSchema.mjs";
import {
  changePresentingTeam,
  stopPresenting,
} from "../src/admin/services/presentingService.mjs";

const withMocks = async (mocks, callback) => {
  const originals = new Map();

  for (const [object, methods] of mocks) {
    for (const [name, implementation] of Object.entries(methods)) {
      originals.set(`${object.modelName || "mongoose"}:${name}`, object[name]);
      object[name] = implementation;
    }
  }

  try {
    await callback();
  } finally {
    for (const [object, methods] of mocks) {
      for (const name of Object.keys(methods)) {
        object[name] = originals.get(
          `${object.modelName || "mongoose"}:${name}`
        );
      }
    }
  }
};

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
  endSession() {
    events.push("end");
  },
});

test("switching teams while another team presents is rejected", async () => {
  const events = [];
  const teamToPresent = {
    _id: "team-2",
    teamName: "Team 2",
    presented: false,
  };
  const currentTeam = { _id: "team-1", teamName: "Team 1" };

  await withMocks(
    [
      [mongoose, { startSession: async () => createSession(events) }],
      [
        Team,
        {
          findById: () => ({ session: async () => teamToPresent }),
          findOne: () => ({ session: async () => currentTeam }),
        },
      ],
    ],
    async () => {
      const result = await changePresentingTeam("team-2");

      assert.equal(result.error, "Another team is currently presenting");
      assert.deepEqual(events, ["start", "abort", "end"]);
    }
  );
});

test("an ineligible replacement leaves the current presenter unchanged", async () => {
  const events = [];
  let currentTeamQueried = false;
  let updateAttempted = false;

  await withMocks(
    [
      [mongoose, { startSession: async () => createSession(events) }],
      [
        Team,
        {
          findById: () => ({
            session: async () => ({ presented: true }),
          }),
          findOne: () => {
            currentTeamQueried = true;
            return { session: async () => ({ _id: "team-1" }) };
          },
          updateOne: async () => {
            updateAttempted = true;
          },
        },
      ],
    ],
    async () => {
      const result = await changePresentingTeam("team-2");

      assert.equal(result.error, "Team has already presented");
      assert.equal(currentTeamQueried, false);
      assert.equal(updateAttempted, false);
      assert.deepEqual(events, ["start", "abort", "end"]);
    }
  );
});

test("explicitly stopping a presentation ends the team", async () => {
  let filter;
  let update;

  await withMocks(
    [
      [
        Team,
        {
          findOneAndUpdate: async (receivedFilter, receivedUpdate) => {
            filter = receivedFilter;
            update = receivedUpdate;
            return { teamName: "Team 1" };
          },
        },
      ],
    ],
    async () => {
      await stopPresenting();

      assert.deepEqual(filter, {
        $or: [
          { state: { $in: ["presenting", "voting"] } },
          { presenting: true },
        ],
      });
      assert.equal(update.$set.presenting, false);
      assert.equal(update.$set.presented, true);
      assert.equal(update.$set.state, "ended");
    }
  );
});
