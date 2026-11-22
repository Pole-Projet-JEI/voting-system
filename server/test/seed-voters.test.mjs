import assert from "node:assert/strict";
import { test } from "node:test";
import Voter from "../src/mongodb/voterSchema.mjs";
import { seedVoters } from "../src/seed/seed-voters.mjs";

test("an emptied database is not refilled with code voters when code login is off", async () => {
  const saved = { flag: process.env.ENABLE_CODE_LOGIN, file: process.env.VOTER_CODES_FILE };
  const originalCount = Voter.countDocuments;
  const originalInsert = Voter.insertMany;
  let inserted = 0;
  Voter.countDocuments = async () => 0;
  Voter.insertMany = async (docs) => { inserted += docs.length; };
  delete process.env.ENABLE_CODE_LOGIN;
  process.env.VOTER_CODES_FILE = "/run/voting/voter-codes.json";
  try {
    await seedVoters();
    assert.equal(inserted, 0);
  } finally {
    Voter.countDocuments = originalCount;
    Voter.insertMany = originalInsert;
    if (saved.flag === undefined) delete process.env.ENABLE_CODE_LOGIN; else process.env.ENABLE_CODE_LOGIN = saved.flag;
    if (saved.file === undefined) delete process.env.VOTER_CODES_FILE; else process.env.VOTER_CODES_FILE = saved.file;
  }
});
