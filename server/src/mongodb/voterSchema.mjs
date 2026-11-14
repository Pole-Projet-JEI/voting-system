import mongoose from "mongoose";

const voterSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      select: false,
      trim: true,
    },
    codeHash: {
      type: String,
      required: true,
      unique: true,
      index: true,
      select: false,
      sparse: true,
    },
    participantSessionHash: {
      type: String,
      index: true,
      select: false,
    },
    participantSessionExpiresAt: Date,
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
