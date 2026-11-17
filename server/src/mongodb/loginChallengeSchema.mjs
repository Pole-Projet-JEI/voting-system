import mongoose from "mongoose";

// One pending email login per address. Expired documents are removed by the
// TTL index.
const loginChallengeSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    codeHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    attempts: { type: Number, default: 0 },
    lastSentAt: { type: Date, required: true },
    sendWindowStart: { type: Date, required: true },
    sendsInWindow: { type: Number, default: 1 },
  },
  { timestamps: true }
);

loginChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 3600 });

const LoginChallenge = mongoose.model("login_challenges", loginChallengeSchema);
export default LoginChallenge;
