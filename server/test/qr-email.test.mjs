import assert from "node:assert/strict";
import { test } from "node:test";

process.env.SESSION_SECRET ||= "test-session-secret";
delete process.env.QR_ROTATE_SECONDS;
delete process.env.QR_GRACE_SECONDS;

const { createQrToken, verifyQrToken } = await import("../src/access/qr-token.mjs");
const {
  createJoinHandler,
  createScanHandler,
  hasValidScanPass,
  normalizeEmail,
  SCAN_COOKIE,
  SCAN_PASS_MAX_AGE,
} = await import("../src/access/access-api.mjs");

const T0 = 1_800_000_000_000; // multiple of 15 s

// ---- rotating token ----

test("a fresh token is accepted during its 15 s window", () => {
  const { token, expiresAt, periodSeconds } = createQrToken(T0 + 1000);
  assert.equal(periodSeconds, 15);
  assert.equal(expiresAt, T0 + 15_000);
  assert.deepEqual(verifyQrToken(token, T0 + 1000), { ok: true });
  assert.deepEqual(verifyQrToken(token, T0 + 14_999), { ok: true });
});

test("the previous token keeps working only for the 10 s grace, then expires", () => {
  const { token } = createQrToken(T0);
  assert.deepEqual(verifyQrToken(token, T0 + 24_999), { ok: true });
  assert.deepEqual(verifyQrToken(token, T0 + 25_000), { ok: false, error: "QR_EXPIRED" });
  assert.deepEqual(verifyQrToken(token, T0 + 3_600_000), { ok: false, error: "QR_EXPIRED" });
});

test("each 15 s window has a different token", () => {
  assert.notEqual(createQrToken(T0).token, createQrToken(T0 + 15_000).token);
  assert.equal(createQrToken(T0).token, createQrToken(T0 + 14_000).token);
});

test("forged, altered or malformed tokens are refused", () => {
  const { token } = createQrToken(T0);
  const [window, mac] = token.split("-");
  const flipped = mac[0] === "A" ? `B${mac.slice(1)}` : `A${mac.slice(1)}`;
  for (const bad of [`${window}-${flipped}`, `${Number(window) + 1}-${mac}`, "", "abc", null, { $ne: 1 }]) {
    assert.equal(verifyQrToken(bad, T0).ok, false, String(bad));
  }
});

// ---- email ----

test("emails are trimmed and lower-cased; bad ones are refused", () => {
  assert.equal(normalizeEmail("  Ali.Ben@Gmail.COM "), "ali.ben@gmail.com");
  for (const bad of ["", "ali", "ali@", "@gmail.com", "ali@gmail", "a b@gmail.com", null, { $ne: 1 }, `${"a".repeat(250)}@x.com`]) {
    assert.equal(normalizeEmail(bad), null, String(bad));
  }
});

// ---- handlers ----

const createResponse = () => ({
  statusCode: 200,
  body: null,
  cookies: {},
  cleared: [],
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
  cookie(name, value, options) { this.cookies[name] = { value, options }; return this; },
  clearCookie(name) { this.cleared.push(name); return this; },
});

const fakeVoter = (email) => ({ _id: "507f1f77bcf86cd799439011", email, saved: 0, async save() { this.saved += 1; } });

const scan = async (deps, body) => {
  const res = createResponse();
  await createScanHandler({ checkOpen: async () => true, mode: () => "qr-email", ...deps })({ body, signedCookies: {} }, res);
  return res;
};

const join = async (deps, body, signedCookies = {}) => {
  const res = createResponse();
  await createJoinHandler({
    findSessionVoter: async () => null,
    checkOpen: async () => true,
    mode: () => "qr-email",
    ...deps,
  })({ body, signedCookies }, res);
  return res;
};

test("scanning a valid QR gives a 10-minute signed scan pass", async () => {
  const res = await scan({}, { t: createQrToken().token });
  assert.equal(res.statusCode, 200);
  assert.match(res.cookies[SCAN_COOKIE].value, /^\d{13}$/);
  assert.equal(res.cookies[SCAN_COOKIE].options.signed, true);
  assert.equal(res.cookies[SCAN_COOKIE].options.httpOnly, true);
  assert.equal(res.cookies[SCAN_COOKIE].options.maxAge, SCAN_PASS_MAX_AGE);
});

test("an expired or forged QR gives no pass", async () => {
  const expired = await scan({}, { t: createQrToken(Date.now() - 60_000).token });
  assert.equal(expired.statusCode, 410);
  assert.equal(expired.body.code, "QR_EXPIRED");
  const forged = await scan({}, { t: "123-AAAAAAAAAAAAAAAAAAAAAA" });
  assert.equal(forged.statusCode, 400);
  assert.deepEqual(forged.cookies, {});
});

test("scan refused while login is closed, and unavailable in link mode", async () => {
  const closed = await scan({ checkOpen: async () => false }, { t: createQrToken().token });
  assert.equal(closed.body.code, "LOGIN_CLOSED");
  const link = await scan({ mode: () => "link" }, { t: createQrToken().token });
  assert.equal(link.statusCode, 404);
});

test("scan pass lasts 10 minutes and cannot be faked", () => {
  const now = Date.now();
  assert.equal(hasValidScanPass({ signedCookies: { [SCAN_COOKIE]: String(now - 60_000) } }, now), true);
  assert.equal(hasValidScanPass({ signedCookies: { [SCAN_COOKIE]: String(now - SCAN_PASS_MAX_AGE) } }, now), false);
  assert.equal(hasValidScanPass({ signedCookies: { [SCAN_COOKIE]: false } }, now), false); // bad signature
  assert.equal(hasValidScanPass({ signedCookies: {} }, now), false);
});

test("joining with an email needs the scan pass", async () => {
  let looked = 0;
  const res = await join({ scanPassOk: () => false, findByEmail: async () => { looked += 1; } }, { email: "a@b.co" });
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, "QR_REQUIRED");
  assert.equal(looked, 0);
});

test("with the pass, a valid email gets a session; the pass is used up", async () => {
  let asked;
  const voter = fakeVoter("ali@gmail.com");
  const res = await join(
    { scanPassOk: () => true, findByEmail: async (email) => { asked = email; return voter; } },
    { email: " Ali@Gmail.com" }
  );
  assert.equal(res.statusCode, 201);
  assert.equal(asked, "ali@gmail.com");
  assert.equal(voter.saved, 1);
  assert.match(res.cookies.connectionCookie.value, /^[a-f0-9]{64}$/);
  assert.equal(res.cookies.voterDevice, undefined);
  assert.deepEqual(res.cleared, [SCAN_COOKIE]);
});

test("an invalid email is refused", async () => {
  const res = await join({ scanPassOk: () => true, findByEmail: async () => fakeVoter() }, { email: "nope" });
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, "EMAIL_INVALID");
});

test("an email already used by someone else is refused (409 EMAIL_TAKEN), no session given", async () => {
  const res = await join({ scanPassOk: () => true, findByEmail: async () => null }, { email: "ali@gmail.com" });
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.code, "EMAIL_TAKEN");
  assert.equal(res.cookies.connectionCookie, undefined);
});
