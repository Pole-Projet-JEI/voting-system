import crypto from "crypto";
import { Router } from "express";
import Voter from "../mongodb/voterSchema.mjs";
import RaffleDraw from "../mongodb/raffleDrawSchema.mjs";
import { requireAdmin } from "../admin/middleware/requireAdmin.mjs";

// Admin "tirage" game: each round draws one email at random among the voter
// emails that have not won yet. Winners are stored here, so they leave the
// game but stay voters (their votes still count). The draw is made on the
// server with a cryptographic random number.

const route = Router();

// Emails still in the game: all voter emails minus previous winners.
export const remainingEmails = (emails, winners) => {
  const won = new Set(winners);
  return [...new Set(emails)].filter((email) => email && !won.has(email)).sort();
};

export const pickWinner = (pool, randomInt = crypto.randomInt) =>
  pool.length ? pool[randomInt(pool.length)] : null;

const loadState = async () => {
  const [emails, draws] = await Promise.all([
    Voter.distinct("email", { email: { $type: "string" } }),
    RaffleDraw.find({}, { round: 1, email: 1, poolSize: 1, createdAt: 1, _id: 0 }).sort({ round: 1 }).lean(),
  ]);
  return { emails, draws, pool: remainingEmails(emails, draws.map((d) => d.email)) };
};

const publicState = ({ emails, draws, pool }) => ({
  totalEmails: emails.length,
  remaining: pool.length,
  pool, // for the spinning animation (admin only)
  winners: draws.map((d) => ({ round: d.round, email: d.email, poolSize: d.poolSize, drawnAt: d.createdAt })),
});

route.get("/api/admin/raffle", requireAdmin, async (req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    return res.json(publicState(await loadState()));
  } catch (error) {
    console.error("Error reading raffle:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

route.post("/api/admin/raffle/draw", requireAdmin, async (req, res) => {
  try {
    // Retry if two draws race for the same round (unique index).
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const state = await loadState();
      const email = pickWinner(state.pool);
      if (!email) {
        return res.status(409).json({ code: "POOL_EMPTY", message: "No email left in the game." });
      }
      try {
        const draw = await RaffleDraw.create({
          round: state.draws.length + 1,
          email,
          poolSize: state.pool.length,
          drawnBy: req.admin?.username || null,
        });
        console.log(JSON.stringify({ event: "raffle_draw", round: draw.round, poolSize: draw.poolSize }));
        const after = await loadState();
        res.set("Cache-Control", "no-store");
        return res.status(201).json({
          winner: { round: draw.round, email: draw.email, poolSize: draw.poolSize, drawnAt: draw.createdAt },
          ...publicState(after),
        });
      } catch (error) {
        if (error?.code !== 11000) throw error;
      }
    }
    return res.status(409).json({ code: "DRAW_BUSY", message: "Another draw is in progress. Try again." });
  } catch (error) {
    console.error("Error drawing raffle winner:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

// Starts the game again: every email is back in.
route.delete("/api/admin/raffle", requireAdmin, async (req, res) => {
  try {
    const { deletedCount } = await RaffleDraw.deleteMany({});
    console.log(JSON.stringify({ event: "raffle_reset", by: req.admin?.username || null, deletedCount }));
    return res.json(publicState(await loadState()));
  } catch (error) {
    console.error("Error resetting raffle:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

export default route;
