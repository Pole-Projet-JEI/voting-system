import { readFile } from "node:fs/promises";
import path from "node:path";
import Voter from "../mongodb/voterSchema.mjs";
import { hashVoterCode } from "../mongodb/voter-code.mjs";

const voterCodesFile = path.resolve(
  process.env.VOTER_CODES_FILE || "private/voter-codes.json"
);

async function loadVoterCodes() {
  let codes;

  try {
    codes = JSON.parse(await readFile(voterCodesFile, "utf8"));
  } catch (error) {
    throw new Error(
      `Cannot load voter codes from ${voterCodesFile}: ${error.message}`
    );
  }

  if (
    !Array.isArray(codes) ||
    codes.length === 0 ||
    codes.some((code) => typeof code !== "string" || !/^[A-Za-z0-9]{9}$/.test(code)) ||
    new Set(codes).size !== codes.length
  ) {
    throw new Error(
      `Invalid voter code file ${voterCodesFile}: expected unique 9-character codes`
    );
  }

  return codes;
}

export async function seedVoters() {
  try {
    const count = await Voter.countDocuments();

    if (count === 0) {
      console.log("📦 Seeding voter database...");
      const voterCodes = await loadVoterCodes();

      const documents = voterCodes.map((code) => ({
        codeHash: hashVoterCode(code),
        votes: [],
        codeVotes: [],
      }));

      await Voter.insertMany(documents);
      console.log(
        `VVVVVVVVVVV Successfully seeded ${documents.length} voter codes`
      );
    } else {
      const legacyVoters = await Voter.find({ code: { $exists: true } })
        .select("+code")
        .lean();

      if (legacyVoters.length > 0) {
        const indexes = await Voter.collection.indexes();
        const legacyCodeIndex = indexes.find(
          (index) => index.key?.code && index.name
        );

        if (legacyCodeIndex) {
          await Voter.collection.dropIndex(legacyCodeIndex.name);
        }
      }

      if (legacyVoters.length > 0) {
        await Voter.bulkWrite(
          legacyVoters.map((voter) => ({
            updateOne: {
              filter: { _id: voter._id },
              update: {
                $set: { codeHash: hashVoterCode(voter.code) },
                $unset: { code: 1 },
              },
            },
          })),
          { ordered: false }
        );
      }

      if (legacyVoters.length > 0) {
        console.log(
          `Migrated ${legacyVoters.length} voter codes to hashes`
        );
      }

      console.log(`Database already contains ${count} voters - skipping seed`);
    }
  } catch (error) {
    console.error("XXXXXXXXXXX Error seeding voters:", error);
    throw error;
  }
}
