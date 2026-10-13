import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { filterHomeQuests, normalizeHomeCategoryFilter } from "../apps/mobile/src/lib/home-discovery.js";

const rows = [
  { id: "q1", hobby_id: "outdoors", title: "Sunset Walk", description: "Easy trail", city: "Austin", availability: "Friday", category: "Outdoors", profile: { display_name: "Mercedes", username: "mercedes" } },
  { id: "q2", hobby_id: "games", title: "Chess Night", description: "Beginners welcome", city: "Boston", availability: "Saturday", category: "Games", profile: { display_name: "Alex", username: "alex" } },
  { id: "q2", hobby_id: "games", title: "duplicate", city: "Boston", category: "Games", profile: {} },
];

const filter = (query = "", categoryFilter = "All") => filterHomeQuests({
  quests: rows,
  query,
  categoryFilter,
  categoryLabel: (quest) => quest.category,
  profileLabel: (quest) => quest.profile,
});

test("matches existing title, place, interest, description, schedule, and profile fields", () => {
  for (const query of ["sunset", "austin", "outdoors", "trail", "friday", "mercedes"]) {
    assert.deepEqual(filter(query).map((quest) => quest.id), ["q1"]);
  }
});

test("category and text filters combine and genuine empty results stay empty", () => {
  assert.deepEqual(filter("boston", "games").map((quest) => quest.id), ["q2"]);
  assert.deepEqual(filter("austin", "games"), []);
  assert.deepEqual(filter("no such plan"), []);
});

test("duplicate result ids render once without changing first-result order", () => {
  assert.deepEqual(filter().map((quest) => quest.id), ["q1", "q2"]);
});

test("removed or hidden selected category resets to All", () => {
  assert.equal(normalizeHomeCategoryFilter("games", ["outdoors", "games"]), "games");
  assert.equal(normalizeHomeCategoryFilter("games", ["outdoors"]), "All");
  assert.equal(normalizeHomeCategoryFilter("All", []), "All");
});

test("native call site sends discovery inputs to the server and retains explicit clear-filter controls", () => {
  const source = fs.readFileSync(new URL("../apps/mobile/src/App.tsx", import.meta.url), "utf8");
  assert.match(source, /normalizeHomeCategoryFilter\(/);
  assert.match(source, /setHomeSearchQuery\(""\)/);
  assert.match(source, /setHomeCategoryFilter\("All"\)/);
  assert.match(source, /client\.rpc\("list_home_quests"/);
  assert.match(source, /result\.source === "fallback"[\s\S]*filterHomeQuests\(/);
});
