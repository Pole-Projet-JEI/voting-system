import assert from "node:assert/strict";
import { test } from "node:test";

process.env.SESSION_SECRET ||= "test-session-secret";

const { createJoinHandler, DEVICE_COOKIE } = await import("../src/access/access-api.mjs");

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

test("opening the link creates a voter and sets the session and device cookies", async () => {
  const voter = fakeVoter();
  const res = await run({ createVoter: async () => voter });
  assert.equal(res.statusCode, 201);
  assert.equal(voter.saved, 1);
  assert.match(res.cookies.connectionCookie.value, /^[a-f0-9]{64}$/);
  assert.equal(res.cookies.connectionCookie.options.httpOnly, true);
  assert.equal(res.cookies.connectionCookie.options.signed, true);
  assert.equal(res.cookies[DEVICE_COOKIE].value, voter._id);
});

test("login closed refuses new joins", async () => {
  let created = 0;
  const res = await run({ checkOpen: async () => false, createVoter: async () => { created += 1; return fakeVoter(); } });
  assert.equal(created, 0);
  assert.deepEqual(res.cookies, {});
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, "LOGIN_CLOSED");
});

test("same phone with an expired session gets back the same voter", async () => {
  const known = fakeVoter("507f1f77bcf86cd7994390aa");
  let created = 0;
  const res = await run({
    findDevice: async () => known,
    createVoter: async () => { created += 1; return fakeVoter(); },
  });
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.reused, true);
  assert.equal(created, 0);
  assert.equal(res.cookies[DEVICE_COOKIE].value, known._id);
});

test("a phone with a live session keeps it and no voter is created", async () => {
  let created = 0;
  const res = await run({
    findSessionVoter: async () => fakeVoter(),
    createVoter: async () => { created += 1; return fakeVoter(); },
    checkOpen: async () => false,
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.reused, true);
  assert.equal(created, 0);
});
