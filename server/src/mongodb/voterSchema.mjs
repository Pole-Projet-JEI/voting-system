import mongoose from "mongoose";

const voterSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    votes: {
      type: Map,
      of: {
        vote: { type: String, enum: ["yes", "no"] },
        votedAt: Date,
      },
      default: () => new Map(),
    },
  },
  { timestamps: true }
);

const Voter = mongoose.model("voters", voterSchema);
export default Voter;
