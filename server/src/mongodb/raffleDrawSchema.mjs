import mongoose from "mongoose";

// One document per draw of the admin "tirage" game. An email can win only
// once (unique), and each round number exists once (unique), so a double
// click cannot create two winners for the same round.
const raffleDrawSchema = new mongoose.Schema(
  {
    round: { type: Number, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    poolSize: { type: Number, required: true },
    drawnBy: { type: String, default: null },
  },
  { timestamps: true }
);

const RaffleDraw = mongoose.model("raffle_draws", raffleDrawSchema);
export default RaffleDraw;
