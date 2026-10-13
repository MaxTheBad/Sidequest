# QuestHat consent-gated metrics dashboard review

## Status

This is a local, reviewable dashboard specification. It does not create a PostHog project, dashboard, destination, person property, or production data pipeline.

All client events are gated by the existing explicit optional-analytics preference. Sentry is separately configured for diagnostics with PII and replay disabled. The build must not treat a local test as evidence that either provider is receiving production events.

## Events suitable for the dashboard

| Event | Properties retained | Purpose |
| --- | --- | --- |
| `discovery_loaded` | `platform`, `result_bucket`, `query_active`, `category_filter_active` | Discovery availability without recording a query or individual result. |
| `quest_join_requested` | `platform`, `join_status`, `join_mode`, `outcome` | Join funnel. |
| `quest_join_reviewed` | `platform`, `decision`, `approval_wait_bucket`, `first_approved_guest` | Host decision latency and whether an approval produced the first non-host guest. |
| `quest_created` | Existing coarse category/location-mode fields | Host funnel. |

Do not attach quest IDs, account IDs, city labels, exact or coarse coordinates, titles, addresses, free-text search, error messages, attendee names, or review/rating answers to these client events.

## City-level view: approval required before configuration

The requested city-level dashboard must be an aggregate, server-side view with a documented privacy threshold (for example, suppress cells under five consenting accounts) and a retention period approved by product/legal. Do **not** add `city` to PostHog client events or person properties.

Before an operator creates that dashboard, obtain written approval for:

1. The source of the aggregate (a privacy-reviewed server query or warehouse export, not raw client event properties).
2. Threshold, retention, access list, and deletion behavior.
3. Whether city is derived from an account profile, a quest's public city, or another approved source.
4. The provider workspace/project, dashboard owner, and read-only reviewer access.

After approval, configure these aggregate tiles: discovery loads, join requests, host decisions, approval-wait buckets, first-approved-guest rate, and failure buckets. Segment only by platform and approved city aggregate; never show low-volume cells.

## Verification checklist

- Confirm optional analytics starts disabled and capture is blocked until consent.
- Confirm opt-out stops capture and resets the client.
- Confirm a synthetic consenting test emits each event with only the properties above.
- Use the existing authenticated Sentry and PostHog read-only tools to confirm ingestion, then record the query timestamp and test event IDs in the release record.
- If the provider tools are unavailable, leave ingestion as **not run**, not passed.
