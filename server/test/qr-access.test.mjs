import assert from "node:assert/strict";
import { test } from "node:test";

process.env.SESSION_SECRET ||= "test-session-secret";
delete process.env.QR_ROTATE_SECONDS;
delete process.env.QR_GRACE_SECONDS;

const { createQrToken, verifyQrToken } = await import("../src/access/qr-token.mjs");
const { createJoinHandler, DEVICE_COOKIE } = await import("../src/access/access-api.mjs");

const T0 = 1_800_000_000_000; // multiple of 20 s

test("a fresh token is accepted during its 20 s window", () => {
  const { token, expiresAt, periodSeconds } = createQrToken(T0 + 1000);
  assert.equal(periodSeconds, 20);
  assert.equal(expiresAt, T0 + 20_000);
  assert.deepEqual(verifyQrToken(token, T0 + 1000), { ok: true });
  assert.deepEqual(verifyQrToken(token, T0 + 19_999), { ok: true });
});

test("the previous token keeps working only for the 10 s grace, then expires", () => {
  const { token } = createQrToken(T0);
  assert.deepEqual(verifyQrToken(token, T0 + 29_999), { ok: true });
  assert.deepEqual(verifyQrToken(token, T0 + 30_000), { ok: false, error: "QR_EXPIRED" });
  assert.deepEqual(verifyQrToken(token, T0 + 3_600_000), { ok: false, error: "QR_EXPIRED" });
});

test("each window has a different token", () => {
  assert.notEqual(createQrToken(T0).token, createQrToken(T0 + 20_000).token);
  assert.equal(createQrToken(T0).token, createQrToken(T0 + 19_000).token);
});

test("forged, altered or malformed tokens are refused", () => {
  const { token } = createQrToken(T0);
  const [window, mac] = token.split("-");
  const flipped = mac[0] === "A" ? `B${mac.slice(1)}` : `A${mac.slice(1)}`;
  for (const bad of [
    `${window}-${flipped}`,
    `${Number(window) + 1}-${mac}`, // reuse a MAC for a later window
    "",
    "abc",
    `${window}-${mac}x`,
    null,
    { $ne: 1 },
  ]) {
    assert.equal(verifyQrToken(bad, T0).ok, false, String(bad));
  }
  assert.equal(verifyQrToken(`${window}-${flipped}`, T0).error, "QR_INVALID");
});

test("a token from another secret is refused", () => {
  const { token } = createQrToken(T0);
  const saved = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = "other-secret";
  try {
    assert.equal(verifyQrToken(token, T0).error, "QR_INVALID");
  } finally {
    process.env.SESSION_SECRET = saved;
  }
});

// ---- join handler ----

const createResponse = () => ({
  statusCode: 200,
  body: null,
  cookies: {},
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
  cookie(name, value, options) { this.cookies[name] = { value, options }; return this; },
});

const fakeVoter = (id = "507f1f77bcf86cd799439011") => ({
  _id: id,
  saved: 0,
  async save() { this.saved += 1; },
});

const run = async (deps, body = {}) => {
  const res = createResponse();
  await createJoinHandler({
    findSessionVoter: async () => null,
    findDevice: async () => null,
    checkOpen: async () => true,
    ...deps,
  })({ body, signedCookies: {} }, res);
  return res;
};

test("a valid scan creates a voter and sets the session and device cookies", async () => {
  const voter = fakeVoter();
  const res = await run(
    { createVoter: async () => voter, verify: () => ({ ok: true }) },
    { t: "x" }
  );
  assert.equal(res.statusCode, 201);
  assert.equal(voter.saved, 1);
  assert.match(res.cookies.connectionCookie.value, /^[a-f0-9]{64}$/);
  assert.equal(res.cookies.connectionCookie.options.httpOnly, true);
  assert.equal(res.cookies.connectionCookie.options.signed, true);
  assert.equal(res.cookies[DEVICE_COOKIE].value, voter._id);
});

test("an expired link is refused with 410 and no voter is created", async () => {
  let created = 0;
  const res = await run({
    createVoter: async () => { created += 1; return fakeVoter(); },
    verify: () => ({ ok: false, error: "QR_EXPIRED" }),
  });
  assert.equal(res.statusCode, 410);
  assert.equal(res.body.code, "QR_EXPIRED");
  assert.equal(created, 0);
  assert.deepEqual(res.cookies, {});
});

test("an invalid link is refused with 400", async () => {
  const res = await run({ verify: () => ({ ok: false, error: "QR_INVALID" }) });
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, "QR_INVALID");
});

test("login closed refuses new joins even with a fresh token", async () => {
  const res = await run({ checkOpen: async () => false, verify: () => ({ ok: true }) });
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, "LOGIN_CLOSED");
});

test("scanning again on the same phone gives back the same voter", async () => {
  const known = fakeVoter("507f1f77bcf86cd7994390aa");
  let created = 0;
  const res = await run({
    findDevice: async () => known,
    createVoter: async () => { created += 1; return fakeVoter(); },
    verify: () => ({ ok: true }),
  });
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.reused, true);
  assert.equal(created, 0);
  assert.equal(res.cookies[DEVICE_COOKIE].value, known._id);
});

test("a phone with a live session is accepted without checking the link", async () => {
  let verified = 0;
  const res = await run({
    findSessionVoter: async () => fakeVoter(),
    verify: () => { verified += 1; return { ok: false, error: "QR_EXPIRED" }; },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.reused, true);
  assert.equal(verified, 0);
});
