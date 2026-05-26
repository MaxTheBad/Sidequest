import test from "node:test";
import assert from "node:assert/strict";
import { isPrivilegedRole, normalizeProfileRole, PRIVILEGED_ROLES } from "../src/lib/admin.js";

test("normalizes roles safely", () => {
  assert.equal(normalizeProfileRole(" Admin "), "admin");
  assert.equal(normalizeProfileRole("SUPER_ADMIN"), "super_admin");
  assert.equal(normalizeProfileRole("something-else"), "user");
  assert.equal(normalizeProfileRole(null), "user");
});

test("detects privileged roles", () => {
  assert.equal(isPrivilegedRole("moderator"), true);
  assert.equal(isPrivilegedRole("user"), false);
  assert.equal(isPrivilegedRole(undefined), false);
});

test("exports the expected privileged role list", () => {
  assert.deepEqual(PRIVILEGED_ROLES, ["moderator", "admin", "super_admin"]);
});
