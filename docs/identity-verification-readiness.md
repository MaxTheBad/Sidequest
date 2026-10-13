# Identity-verification readiness (no vendor enabled)

## Current decision

No identity-verification vendor, SDK, credential, webhook, database field, or verification requirement is enabled by this plan. QuestHat must continue to allow normal use without identity verification unless a separately approved policy changes that rule.

## Decisions required before activation

1. Purpose and scope: which safety decision requires verification, who is eligible, and whether any alternative path exists.
2. Vendor and data flow: vendor contract/DPA, regions, sub-processors, retention, deletion/export path, breach contact, and webhook verification.
3. Consent and notice: clear pre-collection notice; no background collection; accessible appeal and support flow.
4. Access control: least-privileged staff roles, audit trail, no public verification badge unless policy explicitly authorizes it.
5. Risk handling: manual review for failures, unknown outcomes, and disputes; never translate verification failure into an automated attendance, trust, or enforcement penalty.
6. Release controls: staging credentials first, secret storage, webhook signature validation, rollback switch, observability without document/biometric payloads, and a deletion test.

## Go/no-go evidence

Activation needs product, legal/privacy, security, support, and operations approval; an approved retention schedule; a vendor security review; a threat model; and successful staging tests for consent, retry, webhook failure, access revocation, and account deletion. Until then this document is planning material only.
