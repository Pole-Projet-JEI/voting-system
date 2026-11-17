import { readFile } from 'node:fs/promises';
import mongoose from '/app/node_modules/mongoose/index.js';
import Voter from '/app/src/mongodb/voterSchema.mjs';
import Team from '/app/src/mongodb/teamSchema.mjs';
import { hashVoterCode } from '/app/src/mongodb/voter-code.mjs';
import { validateRunDatabase } from './test-target.mjs';

const fixturePath = '/run/perf/sessions.json';
const outputPath = '/run/perf/vote-output.jsonl';
const fixture = JSON.parse(await readFile(fixturePath, 'utf8'));
mongoose.set('autoIndex', false);
mongoose.set('autoCreate', false);
const database = validateRunDatabase(process.env.MONGO_URI, process.env.TEST_DB_NAME, process.env.TEST_RUN_ID);
if (fixture.runId !== process.env.TEST_RUN_ID || fixture.database !== database || fixture.teamId !== process.env.TEAM_ID) throw new Error('Audit fixture does not match this run, database, or team.');
const lines = (await readFile(outputPath, 'utf8')).split(/\r?\n/).filter(Boolean);
const attempts = [];
const reportedSuccesses = [];
for (const line of lines) {
  const point = JSON.parse(line);
  if (point.type === 'Point' && point.metric === 'vote_attempts' && point.data?.tags?.run_id === fixture.runId) attempts.push(point.data.tags);
  if (point.type === 'Point' && point.metric === 'successful_votes' && point.data?.tags?.run_id === fixture.runId) reportedSuccesses.push(point.data.tags);
}
const byVoter = new Map();
for (const attempt of attempts) {
  const index = Number(attempt.voter_index);
  if (!Number.isInteger(index) || index < 0 || index >= fixture.voters.length) throw new Error(`Unexpected voter index in run output: ${attempt.voter_index}`);
  const rows = byVoter.get(index) || [];
  rows.push(attempt);
  byVoter.set(index, rows);
}

const expectedOutcomes = fixture.mode === 'negative'
  ? new Map([[0, ['unauthenticated_rejected']], [1, ['invalid_vote_rejected']], [2, ['malformed_team_rejected']], [3, ['accepted', 'duplicate_rejected']]])
  : new Map(fixture.voters.map((_, index) => [index, ['accepted']]));
for (const [index, expected] of expectedOutcomes) {
  if (fixture.duplicateTest && fixture.mode !== 'negative') expected.push('duplicate_rejected');
  const actual = (byVoter.get(index) || []).map(row => row.outcome);
  if (actual.length !== expected.length || [...actual].sort().join(',') !== [...expected].sort().join(',')) throw new Error(`Run ${fixture.runId}, voter index ${index}: expected outcomes ${expected.join(',')}, got ${actual.join(',') || 'none'}.`);
}
if (attempts.some(row => row.outcome === 'unexpected')) throw new Error('Run output contains an unexpected voting response.');
const acceptedAttempts = attempts.filter(row => row.outcome === 'accepted').map(row => `${row.voter_index}:${row.submitted_vote}`).sort();
const successfulSamples = reportedSuccesses.map(row => `${row.voter_index}:${row.submitted_vote}`).sort();
if (acceptedAttempts.join(',') !== successfulSamples.join(',')) throw new Error('successful_votes metric does not match accepted vote response outcomes.');

await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 5000, readPreference: 'primary' });
try {
  const team = await Team.findById(fixture.teamId).lean();
  if (!team) throw new Error('Audit team was not found.');
  let expectedYes = 0;
  let expectedNo = 0;
  let actualTargetVotes = 0;
  for (let index = 0; index < fixture.voters.length; index++) {
    const voter = fixture.voters[index];
    const record = await Voter.collection.findOne({ codeHash: hashVoterCode(voter.code) });
    if (!record) throw new Error(`Voter index ${index} disappeared from the test database.`);
    const vote = record.votes?.[fixture.teamId];
    const accepted = (byVoter.get(index) || []).some(row => row.outcome === 'accepted');
    const expectedVotes = { ...(voter.baselineVotes || {}) };
    if (accepted) {
      if (!vote || vote.vote !== voter.vote) throw new Error(`Voter index ${index} has no matching single recorded vote.`);
      expectedVotes[fixture.teamId] = { vote: voter.vote };
      actualTargetVotes++;
      if (voter.vote === 'yes') expectedYes++; else expectedNo++;
    }
    const actualVotes = record.votes || {};
    const baselineKeys = Object.keys(expectedVotes).sort();
    const actualKeys = Object.keys(actualVotes).sort();
    if (baselineKeys.join(',') !== actualKeys.join(',')) throw new Error(`Voter index ${index} has an unexpected ballot change after the run.`);
    for (const id of baselineKeys) {
      if (actualVotes[id]?.vote !== expectedVotes[id]?.vote) throw new Error(`Voter index ${index} ballot ${id} differs from the run baseline/accepted result.`);
      if (id !== fixture.teamId && expectedVotes[id]?.votedAt && new Date(actualVotes[id]?.votedAt).toISOString() !== expectedVotes[id].votedAt) throw new Error(`Voter index ${index} existing ballot timestamp changed unexpectedly.`);
    }
  }
  if (actualTargetVotes !== expectedYes + expectedNo) throw new Error('Recorded voter total does not match accepted submission total.');
  if (team.nyes !== fixture.baseline.nyes + expectedYes || team.nno !== fixture.baseline.nno + expectedNo) throw new Error(`Team counters mismatch: expected yes=${fixture.baseline.nyes + expectedYes}, no=${fixture.baseline.nno + expectedNo}; actual yes=${team.nyes}, no=${team.nno}.`);
  const actualCounts = { yes: 0, no: 0 };
  for await (const record of Voter.collection.find({}, { projection: { votes: 1 } })) {
    const ballot = record.votes?.[fixture.teamId];
    if (ballot?.vote === 'yes' || ballot?.vote === 'no') actualCounts[ballot.vote]++;
  }
  if (actualCounts.yes !== fixture.actualBaselineCounts?.yes + expectedYes || actualCounts.no !== fixture.actualBaselineCounts?.no + expectedNo) throw new Error(`Recorded voter totals differ from baseline plus accepted submissions: expected yes=${fixture.actualBaselineCounts?.yes + expectedYes}, no=${fixture.actualBaselineCounts?.no + expectedNo}; actual yes=${actualCounts.yes}, no=${actualCounts.no}.`);
  if (team.nyes !== actualCounts.yes || team.nno !== actualCounts.no) throw new Error(`Team counters do not match independently counted voter ballots: team yes=${team.nyes}, no=${team.nno}; ballots yes=${actualCounts.yes}, no=${actualCounts.no}.`);
  const currentTeams = await Team.find({}, { _id: 1, nyes: 1, nno: 1 }).lean();
  if (currentTeams.length !== fixture.baselineTeams.length) throw new Error('Team set changed during the voting run.');
  for (const baseline of fixture.baselineTeams) {
    const current = currentTeams.find(t => String(t._id) === baseline.id);
    const extraYes = baseline.id === fixture.teamId ? expectedYes : 0;
    const extraNo = baseline.id === fixture.teamId ? expectedNo : 0;
    if (!current || current.nyes !== baseline.nyes + extraYes || current.nno !== baseline.nno + extraNo) throw new Error(`Team ${baseline.id} counters changed outside accepted run votes.`);
  }
  console.log(JSON.stringify({ runId: fixture.runId, database, teamId: fixture.teamId, acceptedVotes: actualTargetVotes, yesVotes: expectedYes, noVotes: expectedNo, duplicateRejections: attempts.filter(a => a.outcome === 'duplicate_rejected').length, result: 'PASS' }));
} finally {
  await mongoose.disconnect();
}
