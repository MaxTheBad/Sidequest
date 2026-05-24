import test from "node:test";
import assert from "node:assert/strict";
import { CANONICAL_CATEGORIES, resolveCanonicalCategory, suggestCanonicalCategories } from "../src/lib/category-suggestions.js";

test("resolves direct canonical categories", () => {
  assert.equal(resolveCanonicalCategory("Build"), "Build");
  assert.equal(resolveCanonicalCategory("creative"), "Creative");
});

test("resolves alias categories", () => {
  assert.equal(resolveCanonicalCategory("startup idea"), "Build");
  assert.equal(resolveCanonicalCategory("gym buddy"), "Healthy Lifestyle");
  assert.equal(resolveCanonicalCategory("photo walk"), "Creative");
});

test("suggests canonical categories from partial input", () => {
  const suggestions = suggestCanonicalCategories("cre");
  assert.ok(suggestions.includes("Creative"));
  assert.ok(suggestions.includes("Career") || suggestions.includes("Creative"));
});

test("returns all categories when input is empty", () => {
  assert.deepEqual(suggestCanonicalCategories(""), [...CANONICAL_CATEGORIES]);
});
