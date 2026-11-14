import assert from "node:assert/strict";
import { test } from "node:test";
import {
  hashAdminPassword,
  verifyAdminPassword,
} from "../src/admin/services/authService.mjs";

test("admin passwords are verified from scrypt hashes", async () => {
  const passwordHash = await hashAdminPassword("a-secure-password");

  assert.equal(await verifyAdminPassword("a-secure-password", passwordHash), true);
  assert.equal(await verifyAdminPassword("wrong-password", passwordHash), false);
});
