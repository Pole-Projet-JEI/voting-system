import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import mongoose from '/app/node_modules/mongoose/index.js';
import Voter from '/app/src/mongodb/voterSchema.mjs';
import Team from '/app/src/mongodb/teamSchema.mjs';
import { hashVoterCode } from '/app/src/mongodb/voter-code.mjs';
import { validateRunDatabase } from './test-target.mjs';

const require = createRequire('/app/package.json');
const cookieSignature = require('cookie-signature');
const runId = process.env.TEST_RUN_ID;
const database = validateRunDatabase(process.env.MONGO_URI, process.env.TEST_DB_NAME, runId);
const teamId = process.env.TEAM_ID;
const codeFile = process.env.VOTER_CODES_FILE;
const sessionSecret = process.env.SESSION_SECRET;
const mode = (process.env.VOTING_MODE || 'benchmark').toLowerCase();
if (!mongoose.isValidObjectId(teamId) || !codeFile || !sessionSecret) throw new Error('TEAM_ID, VOTER_CODES_FILE, and SESSION_SECRET are required.');

await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 5000 });
try {
  const team = await Team.findById(teamId).lean();
  if (!team || !(team.state === 'voting' || (!team.state && team.presenting === true))) throw new Error('TEAM_ID must be the currently voting team.');
  const codes = JSON.parse(await readFile(codeFile, 'utf8'));
  if (!Array.isArray(codes) || !codes.length || codes.some(c => typeof c !== 'string' || !/^[A-Za-z0-9]{9}$/.test(c)) || new Set(codes).size !== codes.length) throw new Error('Voter-code file must contain unique 9-character test codes.');
  const profileVus = { smoke: 5, normal: 50, stress: 200, spike: 100, soak: Number(process.env.SOAK_VUS || 30) }[(process.env.PROFILE || 'smoke').toLowerCase()] || 5;
  const count = mode === 'negative' ? 4 : Number(process.env.VOTER_SESSION_COUNT || profileVus);
  if (mode !== 'negative' && count !== Math.max(profileVus, Number(process.env.REQUIRED_VUS || 0))) throw new Error(`VOTER_SESSION_COUNT must match the selected profile peak (${Math.max(profileVus, Number(process.env.REQUIRED_VUS || 0))}).`);
  if (!Number.isInteger(count) || count < 1 || codes.length < count) throw new Error(`Need ${count} unique test voter codes.`);
  const chosen = codes.slice(0, count);
  const voters = [];
  for (let index = 0; index < chosen.length; index++) {
    const code = chosen[index];
    const codeHash = hashVoterCode(code);
    const voter = await Voter.collection.findOne({ codeHash });
    if (!voter) throw new Error(`Provisioned voter ${index} is not present in this test database; no voter records were seeded by this script.`);
    if (voter.votes?.[String(teamId)]) throw new Error(`Voter index ${index} already has a vote for TEAM_ID; choose a fresh run database/team.`);
    const token = crypto.randomBytes(32).toString('hex');
    const signed = `s:${cookieSignature.sign(token, sessionSecret)}`;
    const update = await Voter.collection.updateOne(
      { _id: voter._id, codeHash },
      { $set: { participantSessionHash: crypto.createHash('sha256').update(token).digest('hex'), participantSessionExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) } }
    );
    if (update.matchedCount !== 1) throw new Error(`Unable to provision isolated participant session for voter index ${index}.`);
    const baselineVotes = Object.fromEntries(Object.entries(voter.votes || {}).map(([id, ballot]) => [id, { vote: ballot.vote, votedAt: ballot.votedAt ? new Date(ballot.votedAt).toISOString() : null }]));
    voters.push({ code, cookie: `connectionCookie=${encodeURIComponent(signed)}`, vote: index % 2 === 0 ? 'yes' : 'no', baselineVotes });
  }
  const baselineTeams = await Team.find({}, { _id: 1, nyes: 1, nno: 1 }).lean();
  const actualBaselineCounts = { yes: 0, no: 0 };
  for await (const row of Voter.collection.find({}, { projection: { votes: 1 } })) {
    const ballot = row.votes?.[String(teamId)];
    if (ballot?.vote === 'yes' || ballot?.vote === 'no') actualBaselineCounts[ballot.vote]++;
  }
  console.log(JSON.stringify({ version: 1, runId, database, teamId: String(team._id), baseline: { nyes: team.nyes, nno: team.nno }, actualBaselineCounts, baselineTeams: baselineTeams.map(t => ({ id: String(t._id), nyes: t.nyes, nno: t.nno })), mode, duplicateTest: process.env.TEST_DUPLICATES === 'true', voters }));
} finally {
  await mongoose.disconnect();
}
