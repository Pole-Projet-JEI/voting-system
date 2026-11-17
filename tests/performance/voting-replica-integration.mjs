import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import mongoose from "/app/node_modules/mongoose/index.js";
import Team from "/app/src/mongodb/teamSchema.mjs";
import Voter from "/app/src/mongodb/voterSchema.mjs";
import router from "/app/src/vote/voting.mjs";

const uri = process.env.VOTE_INTEGRATION_MONGO_URI;
const database = process.env.VOTE_INTEGRATION_DB;
const integrationAppName = `vote-retry-integration-${randomUUID()}`;
if (!uri || !database || !/^voting_integration_test_[a-f0-9]{16,32}$/.test(database)) {
  throw new Error("Set VOTE_INTEGRATION_MONGO_URI and a fresh VOTE_INTEGRATION_DB named voting_integration_test_<random hex>.");
}
const parsed = new URL(uri);
if (parsed.hostname !== "mongo-performance" || parsed.searchParams.get("replicaSet") !== "rs0" || parsed.pathname !== `/${database}`) {
  throw new Error("Integration test only accepts the dedicated mongo-performance rs0 database.");
}
parsed.searchParams.set("appName", integrationAppName);

const voteHandler = router.stack.find((entry) => entry.route?.path === "/api/vote/:id").route.stack.at(-1).handle;
const voteRequest = (teamId, voterId, vote) => ({
  params: { id: String(teamId) }, body: { vote }, voter: { _id: voterId },
  requestId: randomUUID(),
});
const response = () => ({ statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });
const submit = async (teamId, voterId, vote, requestId = randomUUID()) => {
  const res = response();
  const request = voteRequest(teamId, voterId, vote);
  request.requestId = requestId;
  res.requestId = request.requestId;
  await voteHandler(request, res);
  return res;
};

if (process.env.VOTING_TRANSACTION_DIAGNOSTICS !== "true") {
  throw new Error("Run with VOTING_TRANSACTION_DIAGNOSTICS=true to verify real callback retries.");
}

await mongoose.connect(parsed.toString(), { serverSelectionTimeoutMS: 5000 });
try {
  const existing = await mongoose.connection.db.listCollections().toArray();
  if (existing.length) throw new Error("Refusing to run against a non-empty integration database.");

  const team = await Team.create({ teamName: `integration-${Date.now()}`, state: "voting", nyes: 7, nno: 4 });
  const baseline = { nyes: team.nyes, nno: team.nno };
  const voters = await Voter.create(Array.from({ length: 5 }, (_, i) => ({ codeHash: `integration-${Date.now()}-${i}` })));
  const choices = ["yes", "no", "yes", "no", "yes"];
  const responses = await Promise.all(voters.map((voter, i) => submit(team._id, voter._id, choices[i])));
  assert(responses.every((r) => r.statusCode === 200), "all five concurrent votes should succeed");

  const stored = await Voter.find({ _id: { $in: voters.map((v) => v._id) } }).lean();
  const ballotFor = (voter) => voter.votes?.get?.(String(team._id))?.vote ?? voter.votes?.[String(team._id)]?.vote;
  const ballots = stored.map(ballotFor);
  assert.deepEqual(ballots, choices);
  const yes = ballots.filter((v) => v === "yes").length;
  const no = ballots.filter((v) => v === "no").length;
  let currentTeam = await Team.findById(team._id).lean();
  assert.equal(currentTeam.nyes, baseline.nyes + yes);
  assert.equal(currentTeam.nno, baseline.nno + no);
  assert.equal(stored.filter((v) => ballotFor(v) === undefined).length, 0, "no partial/missing ballot writes");

  const duplicates = await Promise.all([
    submit(team._id, voters[0]._id, "no"),
    submit(team._id, voters[0]._id, "no"),
  ]);
  assert(duplicates.every((r) => r.statusCode === 400
    && r.body.voted === false
    && r.body.message === "You have already voted for this team"
    && r.body.existingVote === "yes"));
  const duplicateVoter = await Voter.findById(voters[0]._id).lean();
  assert.equal(ballotFor(duplicateVoter), "yes", "duplicates preserve the original ballot");
  currentTeam = await Team.findById(team._id).lean();
  assert.equal(currentTeam.nyes, baseline.nyes + yes);
  assert.equal(currentTeam.nno, baseline.nno + no);

  // Fail one real MongoDB update with code 112 and the transient label. The
  // driver's withTransaction implementation should re-run the callback.
  const admin = mongoose.connection.db.admin();
  const parameters = await admin.command({ getParameter: 1, enableTestCommands: 1 });
  if (parameters.enableTestCommands !== true) {
    throw new Error("MongoDB started without enableTestCommands=1; refusing to configure a failpoint.");
  }
  await admin.command({ configureFailPoint: "failCommand", mode: { times: 1 }, data: {
    failCommands: ["update"], appName: integrationAppName,
    errorCode: 112, errorLabels: ["TransientTransactionError"],
  } });
  try {
    const retryVoter = await Voter.create({ codeHash: `integration-retry-${Date.now()}` });
    const diagnosticEvents = [];
    const retryRequestId = randomUUID();
    const originalInfo = console.info;
    console.info = (message, ...rest) => {
      if (typeof message === "string") {
        try {
          const event = JSON.parse(message);
          if (event.requestId === retryRequestId) diagnosticEvents.push(event);
        } catch {}
      }
      originalInfo.call(console, message, ...rest);
    };
    let retryResponse;
    try {
      retryResponse = await submit(team._id, retryVoter._id, "yes", retryRequestId);
    } finally {
      console.info = originalInfo;
    }
    assert.equal(retryResponse.statusCode, 200, "transient error should be retried by the real driver");
    const retryEvents = diagnosticEvents.filter((event) => event.event === "vote_transaction_retry");
    const successEvent = diagnosticEvents.find((event) => event.event === "vote_transaction_succeeded");
    assert(retryEvents.length >= 1, "failpoint must cause callback re-entry");
    assert(successEvent, "retried transaction must emit a success diagnostic");
    assert(successEvent.callbackAttempts >= 2, "success must report at least two callback invocations");
    assert.equal(successEvent.callbackAttempts, retryEvents.length + 1, "retry events must account for every callback after the first");
    const retryStored = await Voter.findById(retryVoter._id).lean();
    assert.equal(ballotFor(retryStored), "yes");
    currentTeam = await Team.findById(team._id).lean();
    assert.equal(currentTeam.nyes, baseline.nyes + yes + 1, "retry must not double increment");
    assert.equal(currentTeam.nno, baseline.nno + no);
  } finally {
    await admin.command({ configureFailPoint: "failCommand", mode: "off" });
  }

  console.log(JSON.stringify({ result: "PASS", concurrentVotes: 5, duplicateRequests: 2, transientRetry: "passed", persistedYes: yes + 1, persistedNo: no }));
} finally {
  await mongoose.disconnect();
}
