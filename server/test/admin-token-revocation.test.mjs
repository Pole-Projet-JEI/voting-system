import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { test } from "node:test";
import AdminTokenRevocation from "../src/mongodb/adminTokenRevocationSchema.mjs";
import {
  generateAdminToken,
  hashAdminToken,
} from "../src/admin/services/authService.mjs";
import logoutRouter from "../src/admin/apis/auth/logout.mjs";
import { requireAdmin } from "../src/admin/middleware/requireAdmin.mjs";
import { JWT_SECRET } from "../src/config/secrets.mjs";

const revocationRouteHandler = logoutRouter.stack
  .find((entry) => entry.route?.path === "/api/admin/logout")
  .route.stack.at(-1).handle;

const createResponse = () => ({
  statusCode: 200,
  body: null,
  clearedCookie: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  },
  clearCookie(name, options) {
    this.clearedCookie = { name, options };
    return this;
  },
});

const withRevocationStore = async (callback) => {
  const originalFindOne = AdminTokenRevocation.findOne;
  const originalUpdateOne = AdminTokenRevocation.updateOne;
  const records = new Map();

  AdminTokenRevocation.findOne = (filter) => ({
    lean: async () => {
      const record = records.get(filter.tokenHash);
      return record && record.expiresAt > filter.expiresAt.$gt ? record : null;
    },
  });
  AdminTokenRevocation.updateOne = async (filter, update) => {
    records.set(filter.tokenHash, {
      tokenHash: filter.tokenHash,
      expiresAt: update.$set.expiresAt,
    });
    return { acknowledged: true, upsertedCount: 1 };
  };

  try {
    await callback(records);
  } finally {
    AdminTokenRevocation.findOne = originalFindOne;
    AdminTokenRevocation.updateOne = originalUpdateOne;
  }
};

const authenticate = async (token) => {
  const req = { cookies: { adminToken: token } };
  const res = createResponse();
  let nextCalled = false;

  await requireAdmin(req, res, () => {
    nextCalled = true;
  });

  return { req, res, nextCalled };
};

test("valid admin JWTs authenticate through the real middleware", async () => {
  await withRevocationStore(async () => {
    const token = generateAdminToken("admin-user");
    const result = await authenticate(token);

    assert.equal(result.nextCalled, true);
    assert.equal(result.req.admin.username, "admin-user");
  });
});

test("logout revokes the current token and clears a matching cookie", async () => {
  await withRevocationStore(async (records) => {
    const token = generateAdminToken("admin-user");
    const res = createResponse();

    await revocationRouteHandler({ cookies: { adminToken: token } }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.deepEqual(res.clearedCookie, {
      name: "adminToken",
      options: {
        httpOnly: true,
        secure: false,
        sameSite: "lax",
      },
    });
    assert.equal(records.has(hashAdminToken(token)), true);

    const result = await authenticate(token);
    assert.equal(result.nextCalled, false);
    assert.equal(result.res.statusCode, 403);
  });
});

test("a different valid token remains usable after logout", async () => {
  await withRevocationStore(async () => {
    const revokedToken = generateAdminToken("admin-one");
    const validToken = generateAdminToken("admin-two");
    const logoutResponse = createResponse();

    await revocationRouteHandler(
      { cookies: { adminToken: revokedToken } },
      logoutResponse
    );

    const result = await authenticate(validToken);
    assert.equal(result.nextCalled, true);
    assert.equal(result.req.admin.username, "admin-two");
  });
});

test("expired, malformed, and revoked tokens are rejected", async () => {
  await withRevocationStore(async () => {
    const expiredToken = jwt.sign(
      { role: "admin", username: "expired" },
      JWT_SECRET,
      { expiresIn: -1 }
    );

    for (const token of ["not-a-jwt", expiredToken]) {
      const result = await authenticate(token);
      assert.equal(result.nextCalled, false);
      assert.equal(result.res.statusCode, 403);
    }

    const revokedToken = generateAdminToken("revoked");
    const logoutResponse = createResponse();
    await revocationRouteHandler(
      { cookies: { adminToken: revokedToken } },
      logoutResponse
    );
    const revokedResult = await authenticate(revokedToken);
    assert.equal(revokedResult.nextCalled, false);
  });
});

test("revocations persist across middleware calls and use TTL cleanup metadata", async () => {
  await withRevocationStore(async (records) => {
    const token = generateAdminToken("persistent-admin");
    const logoutResponse = createResponse();
    await revocationRouteHandler(
      { cookies: { adminToken: token } },
      logoutResponse
    );

    const afterRestart = await authenticate(token);
    assert.equal(afterRestart.nextCalled, false);
    assert.equal(records.get(hashAdminToken(token)).expiresAt > new Date(), true);

    const ttlIndexes = AdminTokenRevocation.schema.indexes();
    assert.equal(
      ttlIndexes.some(
        ([fields, options]) =>
          fields.expiresAt === 1 && options.expireAfterSeconds === 0
      ),
      true
    );
  });
});
