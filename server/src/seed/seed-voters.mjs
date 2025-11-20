import Voter from "../mongodb/voterSchema.mjs";
import { voterCodes } from "./codes.mjs";

export async function seedVoters() {
  try {
    const count = await Voter.countDocuments();

    if (count === 0) {
      console.log("📦 Seeding voter database...");

      const documents = voterCodes.map((code) => ({
        code,
        votes: [],
        codeVotes: [],
      }));

      await Voter.insertMany(documents);
      console.log(
        `VVVVVVVVVVV Successfully seeded ${documents.length} voter codes`
      );
    } else {
      console.log(`Database already contains ${count} voters - skipping seed`);
    }
  } catch (error) {
    console.error("XXXXXXXXXXX Error seeding voters:", error);
    throw error;
  }
}
