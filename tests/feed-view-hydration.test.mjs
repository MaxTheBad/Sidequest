import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToString } from "react-dom/server";
import { useHydratedFeedView } from "../src/lib/use-hydrated-feed-view.ts";
import { readFeedView, publishFeedView, subscribeFeedView } from "../src/lib/feed-view.js";

test("SSR and hydration snapshot stay list even when the browser has saved map", () => {
  const previous = globalThis.window;
  globalThis.window = { localStorage: { getItem: () => "map" } };
  try {
    function Feed() { const [mode] = useHydratedFeedView(); return React.createElement("div", null, mode); }
    assert.equal(renderToString(React.createElement(Feed)), "<div>list</div>");
    assert.equal(readFeedView(window), "map", "saved map is retained for the post-hydration snapshot");
  } finally { if (previous === undefined) delete globalThis.window; else globalThis.window = previous; }
});

test("feed preference changes notify subscribers and cleanup detaches listeners", () => {
  let value = "map";
  const listeners = new Map();
  const target = { localStorage: { getItem: () => value, setItem: (_, next) => { value = next; } }, addEventListener: (event, callback) => listeners.set(event, callback), removeEventListener: event => listeners.delete(event), dispatchEvent: event => listeners.get(event.type)?.(event) };
  const modes = [];
  const stop = subscribeFeedView(target, mode => modes.push(mode));
  publishFeedView(target, "list");
  assert.deepEqual(modes, ["map", "list"]);
  stop();
  publishFeedView(target, "map");
  assert.deepEqual(modes, ["map", "list"]);
  assert.equal(listeners.size, 0);
  assert.equal(readFeedView({ localStorage: { getItem() { throw new Error("denied"); } } }), "list");
});
