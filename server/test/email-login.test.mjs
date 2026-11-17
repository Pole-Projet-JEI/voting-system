import assert from "node:assert/strict";
import { test } from "node:test";
import nodemailer from "nodemailer";
import LoginChallenge from "../src/mongodb/loginChallengeSchema.mjs";
import {
  hashLoginCode,
  isDomainAllowed,
  issueLoginCode,
  MAX_VERIFY_ATTEMPTS,
  normalizeEmail,
  RESEND_COOLDOWN_MS,
  verifyLoginCode,
} from "../src/email-login/email-login.mjs";
import { buildLoginEmail, sendLoginCode } from "../src/email-login/mailer.mjs";

process.env.SESSION_SECRET ||= "test-session-secret";

// Minimal in-memory LoginChallenge implementing the calls the module makes.
const useMemoryChallenges = () => {
  const store = new Map();
  const matches = (doc, filter, now) =>
    (!filter.expiresAt || doc.expiresAt > filter.expiresAt.$gt) &&
    (!filter.attempts || doc.attempts < filter.attempts.$lt);
  LoginChallenge.findOne = (filter) => ({ lean: async () => store.get(filter.email) || null });
  LoginChallenge.updateOne = async (filter, update) => {
    store.set(filter.email, { email: filter.email, ...(store.get(filter.email) || {}), ...update.$set });
    return { acknowledged: true };
  };
  LoginChallenge.findOneAndUpdate = (filter, update) => ({
    lean: async () => {
      const doc = store.get(filter.email);
      if (!doc || !matches(doc, filter)) return null;
      doc.attempts += update.$inc.attempts;
      return { ...doc };
    },
  });
  LoginChallenge.exists = async (filter) => (store.has(filter.email) ? { _id: 1 } : null);
  LoginChallenge.deleteOne = async (filter) => store.delete(filter.email);
  return store;
};

test("normalizeEmail lowercases, trims and rejects junk", () => {
  assert.equal(normalizeEmail("  Ali.Ben@Example.COM "), "ali.ben@example.com");
  assert.equal(normalizeEmail("not-an-email"), null);
  assert.equal(normalizeEmail("a@b"), null);
  assert.equal(normalizeEmail({ $gt: "" }), null);
  assert.equal(normalizeEmail(`${"a".repeat(250)}@x.com`), null);
});

test("domain allow-list matches the exact domain", () => {
  assert.equal(isDomainAllowed("x@insat.ucar.tn", ["insat.ucar.tn"]), true);
  assert.equal(isDomainAllowed("x@evil-insat.ucar.tn", ["insat.ucar.tn"]), false);
  assert.equal(isDomainAllowed("x@gmail.com", []), false);
});

test("a correct code logs in once; the code cannot be reused", async () => {
  useMemoryChallenges();
  const email = "voter@example.com";
  const { code } = await issueLoginCode(email);
  assert.match(code, /^\d{6}$/);

  assert.deepEqual(await verifyLoginCode(email, code), { ok: true });
  assert.equal((await verifyLoginCode(email, code)).error, "NO_CODE");
});

test("wrong codes are limited per address", async () => {
  useMemoryChallenges();
  const email = "guess@example.com";
  const { code } = await issueLoginCode(email);
  const wrong = code === "000000" ? "111111" : "000000";

  for (let i = 0; i < MAX_VERIFY_ATTEMPTS; i++) {
    assert.equal((await verifyLoginCode(email, wrong)).error, "INVALID_CODE");
  }
  // Even the right code is refused once the attempts are used up.
  assert.equal((await verifyLoginCode(email, code)).error, "CODE_EXPIRED_OR_LOCKED");
});

test("expired codes are refused", async () => {
  useMemoryChallenges();
  const email = "late@example.com";
  const issuedAt = new Date("2026-01-01T10:00:00Z");
  const { code } = await issueLoginCode(email, issuedAt);
  const later = new Date(issuedAt.getTime() + 11 * 60 * 1000);
  assert.equal((await verifyLoginCode(email, code, later)).error, "CODE_EXPIRED_OR_LOCKED");
});

test("resending is throttled per address", async () => {
  useMemoryChallenges();
  const email = "spam@example.com";
  const t0 = new Date("2026-01-01T10:00:00Z");
  assert.ok((await issueLoginCode(email, t0)).code);

  const tooSoon = await issueLoginCode(email, new Date(t0.getTime() + 5000));
  assert.equal(tooSoon.error, "COOLDOWN");

  let t = t0.getTime();
  for (let i = 0; i < 4; i++) {
    t += RESEND_COOLDOWN_MS + 1000;
    assert.ok((await issueLoginCode(email, new Date(t))).code, `send ${i + 2}`);
  }
  t += RESEND_COOLDOWN_MS + 1000;
  assert.equal((await issueLoginCode(email, new Date(t))).error, "TOO_MANY_SENDS");
});

test("malformed codes are rejected before any lookup", async () => {
  LoginChallenge.findOneAndUpdate = () => {
    throw new Error("should not query");
  };
  assert.equal((await verifyLoginCode("a@example.com", "12ab56")).error, "INVALID_CODE");
  assert.equal((await verifyLoginCode("a@example.com", { $ne: "" })).error, "INVALID_CODE");
});

test("code hashes depend on the address", () => {
  assert.notEqual(hashLoginCode("a@x.com", "123456"), hashLoginCode("b@x.com", "123456"));
});

test("the email contains the code and is sent to the voter", async () => {
  const transport = nodemailer.createTransport({ jsonTransport: true });
  let sent;
  const spy = { sendMail: async (message) => { sent = message; return transport.sendMail(message); } };
  await sendLoginCode("voter@example.com", "042917", { transport: spy });
  assert.equal(sent.to, "voter@example.com");
  assert.match(sent.subject, /042917/);
  assert.match(buildLoginEmail("042917").text, /042917/);
});

test("production without SMTP refuses instead of silently not sending", async () => {
  const previous = { env: process.env.NODE_ENV, host: process.env.SMTP_HOST };
  process.env.NODE_ENV = "production";
  delete process.env.SMTP_HOST;
  try {
    await assert.rejects(sendLoginCode("v@example.com", "123456"), /SMTP is not configured/);
  } finally {
    process.env.NODE_ENV = previous.env;
    if (previous.host) process.env.SMTP_HOST = previous.host;
  }
});

test("legacy code login is disabled by default", async () => {
  const previous = process.env.ENABLE_CODE_LOGIN;
  delete process.env.ENABLE_CODE_LOGIN;
  try {
    const registerRouter = (await import("../src/register/register.mjs")).default;
    const handler = registerRouter.stack
      .find((entry) => entry.route?.path === "/api/register")
      .route.stack.at(-1).handle;
    let status;
    let body;
    await handler(
      { body: { code: "ABCDEFGHJ" } },
      { status(code) { status = code; return this; }, json(data) { body = data; return this; } }
    );
    assert.equal(status, 410);
    assert.equal(body.code, "CODE_LOGIN_DISABLED");
  } finally {
    if (previous !== undefined) process.env.ENABLE_CODE_LOGIN = previous;
  }
});

test("a closed login window refuses code requests and verification", async () => {
  const { requireLoginOpen } = await import("../src/email-login/login-window.mjs");
  const closed = requireLoginOpen({ checkOpen: async () => false });
  const open = requireLoginOpen({ checkOpen: async () => true });
  let status;
  let body;
  let nextCalled = false;
  const res = { status(code) { status = code; return this; }, json(data) { body = data; return this; } };

  await closed({}, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(status, 403);
  assert.equal(body.code, "LOGIN_CLOSED");

  await open({}, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
});

test("both email login routes are behind the login window", async () => {
  const router = (await import("../src/email-login/email-login-api.mjs")).default;
  for (const path of ["/api/login/email/request", "/api/login/email/verify"]) {
    const layer = router.stack.find((entry) => entry.route?.path === path);
    assert.equal(layer.route.stack.length, 3, `${path}: limiter, login window, handler`);
  }
});

test("the SMTP password can come from a file, with any characters", async () => {
  const { mkdtempSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { readSmtpPassword } = await import("../src/email-login/mailer.mjs");
  const file = join(mkdtempSync(join(tmpdir(), "smtp-")), "pw");
  writeFileSync(file, "a'b\"c$d)4).'\n");
  process.env.SMTP_PASS_FILE = file;
  try {
    assert.equal(readSmtpPassword(), "a'b\"c$d)4).'");
  } finally {
    delete process.env.SMTP_PASS_FILE;
  }
});

test("gmail dots and +aliases map to one voter", async () => {
  const { canonicalizeEmail } = await import("../src/email-login/email-login.mjs");
  assert.equal(canonicalizeEmail("ali.ben@gmail.com"), "aliben@gmail.com");
  assert.equal(canonicalizeEmail("a.l.i.ben+vote2@gmail.com"), "aliben@gmail.com");
  assert.equal(canonicalizeEmail("aliben@googlemail.com"), "aliben@gmail.com");
  assert.equal(canonicalizeEmail("sara+x@outlook.com"), "sara@outlook.com");
  // Other providers keep dots (they are real, different mailboxes there).
  assert.equal(canonicalizeEmail("ali.ben@insat.ucar.tn"), "ali.ben@insat.ucar.tn");
});

test("disposable inboxes are refused even when anyone can log in", async () => {
  const { isEmailAllowed, isDisposableEmail } = await import("../src/email-login/email-login.mjs");
  const anyone = async () => ({ open: true, anyEmail: true });
  assert.equal(isDisposableEmail("x@mailinator.com"), true);
  assert.equal(await isEmailAllowed("x@yopmail.com", { loadSettings: anyone }), false);
  assert.equal(await isEmailAllowed("x@gmail.com", { loadSettings: anyone }), true);
});

test("list mode only allows imported emails", async () => {
  const { isEmailAllowed } = await import("../src/email-login/email-login.mjs");
  const Voter = (await import("../src/mongodb/voterSchema.mjs")).default;
  const listOnly = async () => ({ open: true, anyEmail: false });
  const originalExists = Voter.exists;
  Voter.exists = async ({ email }) => (email === "listed@gmail.com" ? { _id: 1 } : null);
  try {
    assert.equal(await isEmailAllowed("listed@gmail.com", { loadSettings: listOnly }), true);
    assert.equal(await isEmailAllowed("other@gmail.com", { loadSettings: listOnly }), false);
  } finally {
    Voter.exists = originalExists;
  }
});

test("anyone mode creates the voter on first verified login", async () => {
  const { findOrCreateEmailVoter } = await import("../src/email-login/email-login.mjs");
  const Voter = (await import("../src/mongodb/voterSchema.mjs")).default;
  const original = { findOne: Voter.findOne, create: Voter.create };
  let created = null;
  Voter.findOne = async () => null;
  Voter.create = async (doc) => (created = { _id: "new", ...doc });
  try {
    const voter = await findOrCreateEmailVoter("new@gmail.com", { loadSettings: async () => ({ anyEmail: true }) });
    assert.equal(voter.email, "new@gmail.com");
    assert.equal(created.email, "new@gmail.com");
    const refused = await findOrCreateEmailVoter("new@gmail.com", { loadSettings: async () => ({ anyEmail: false }) });
    assert.equal(refused, null);
  } finally {
    Object.assign(Voter, original);
  }
});
