import test from "node:test";
import assert from "node:assert/strict";
import Sentry from "@sentry/nextjs";
import { scrubSentryEvent, sentryPrivacyOptions } from "../src/lib/sentry-privacy.ts";

test("route transaction names redact IDs and queries while preserving HTTP method", () => {
  assert.equal(scrubSentryEvent({ transaction: "GET /inbox/private-thread?token=secret" }).transaction, "GET /inbox/[id]");
  assert.equal(scrubSentryEvent({ transaction: "POST https://questhat.com/profile/private-person?token=secret" }).transaction, "POST https://questhat.com/profile/[id]");
});

test("installed Sentry SDK invokes the transaction scrubber before transport", async () => {
  const envelopes = [];
  Sentry.init({
    dsn: "https://public@example.invalid/1",
    defaultIntegrations: false,
    tracesSampleRate: 1,
    transport: () => ({ send: async envelope => { envelopes.push(envelope); return { statusCode: 200 }; }, flush: async () => true }),
    ...sentryPrivacyOptions(),
  });
  const id = "8f157260-5028-4b08-9080-d4ba9b0bf910";
  Sentry.getClient().captureEvent({
    type: "transaction", transaction: `/listing/${id}?private=secret`,
    start_timestamp: 1, timestamp: 2,
    contexts: { trace: { trace_id: "a".repeat(32), span_id: "b".repeat(16), data: { private: "secret" } } },
    user: { email: "private@example.invalid" }, extra: { private: "secret" },
    request: { url: `https://questhat.com/listing/${id}?private=secret`, headers: { Authorization: "secret" }, data: "secret" },
    spans: [{ trace_id: "a".repeat(32), span_id: "c".repeat(16), start_timestamp: 1, timestamp: 2, description: "private address", data: { private: "secret" } }],
  });
  await Sentry.flush(2000);
  const transactions = envelopes.flatMap(envelope => envelope[1]).filter(item => item[0].type === "transaction").map(item => item[1]);
  assert.equal(transactions.length, 1, "the SDK must send a scrubbed static transaction");
  const event = transactions[0];
  assert.equal(event.transaction, "/listing/[id]");
  assert.equal(event.request.url, "https://questhat.com/listing/[id]");
  assert.equal(event.user, undefined);
  assert.equal(event.extra, undefined);
  assert.equal(event.contexts.trace.data, undefined);
  assert.equal(event.spans[0].description, undefined);
  assert.equal(event.spans[0].data, undefined);
  assert.doesNotMatch(JSON.stringify(event), /secret|private@example|private address|8f157260/);
  await Sentry.close(2000);
});
