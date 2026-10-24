import assert from "node:assert/strict";
import test from "node:test";
import { createLocationRequestGate } from "../src/lib/location-request.js";

function fakeGeolocation() {
  const requests = [];
  return {
    requests,
    getCurrentPosition(success, error, options) {
      requests.push({ success, error, options });
    },
  };
}

test("location requests are single-flight and stale callbacks cannot overwrite a newer result", () => {
  const geolocation = fakeGeolocation();
  const gate = createLocationRequestGate();
  const events = [];
  const handlers = {
    onStart: () => events.push("loading"),
    onSuccess: () => events.push("success"),
    onError: () => events.push("error"),
  };

  assert.equal(gate.request(geolocation, handlers, {}), true);
  assert.equal(gate.request(geolocation, handlers, {}), false);
  assert.equal(geolocation.requests.length, 1);
  geolocation.requests[0].success({ coords: { latitude: 1, longitude: 2, accuracy: 3 } });
  assert.equal(gate.request(geolocation, handlers, {}), true);
  geolocation.requests[0].error({ code: 1 });
  geolocation.requests[1].success({ coords: { latitude: 4, longitude: 5, accuracy: 6 } });
  assert.deepEqual(events, ["loading", "success", "loading", "success"]);
});

test("cancel invalidates outstanding success and error callbacks", () => {
  const geolocation = fakeGeolocation();
  const gate = createLocationRequestGate();
  const events = [];
  gate.request(geolocation, {
    onStart: () => events.push("loading"),
    onSuccess: () => events.push("success"),
    onError: () => events.push("error"),
  }, {});
  gate.cancel();
  geolocation.requests[0].success({ coords: {} });
  geolocation.requests[0].error({ code: 1 });
  assert.deepEqual(events, ["loading"]);
  assert.equal(gate.isActive(), false);
});
