# QuestHat release-readiness record — 2026-10-12

## Integrated replacement artifact — 2026-10-13

- Canonical integration: 74 reviewed paths (27 replacements and 47 additions) were copied into `/Users/clawd/.openclaw/workspace-control/sidequest` after a byte-for-byte pre-integration snapshot and an external backup. The final canonical files match the validated candidate mirror.
- Compatibility repair: the mobile home feed still prefers the `list_home_quests` RPC, but falls back only when PostgREST reports that named function missing (`PGRST202` or PostgreSQL `42883`). The fallback preserves the canonical visibility/time predicates, blocked-profile filtering, lookahead cursor pagination, stale-request gate, append merge/deduplication, and count refresh. Auth, RLS, network, and unrelated errors are not masked. While the fallback is active, the UI is explicitly limited to `Just posted`; unsupported global sorts are not advertised.
- Archive: `/Volumes/My Passport/Codex/questhat-local-build-1.0.1-128/archives/QuestHat-1.0.1-128.xcarchive`
- IPA: `/Volumes/My Passport/Codex/questhat-local-build-1.0.1-128/export/QuestHat.ipa`
- Version/build and bundle identifier: `1.0.1 (128)`, `com.questhat.app`
- IPA SHA-256: `072b0db064fc6960f8878b7903ca5a0a0648142af1618482304de1f6cc1f3b0a`
- Exported executable SHA-256: `dc3a91ca290a2249498e2ffa7ecfa58782c74af8c571512ecc63d426dfe56588`
- Embedded bundle SHA-256: `5d05b91adcf5c48bfeb36a54a3001767b4fc5d3b67a80179e490a4b1f725b4c5`
- Packaged Expo configuration SHA-256: `613e1bc9be6aff7532e7d4b72c05dabf4745b377a2e4ae07e23bfb041f168711`
- Verification: source tests passed 308/308; mobile TypeScript passed; lint completed with 0 errors and 100 warnings; packaged/source runtime configuration passed; Next.js 16.4.0 production build completed all 32 pages; signed archive and export completed; elevated `codesign --verify --deep --strict` reported the exported app valid on disk and satisfying its designated requirement.
- Runtime smoke: a Release iOS Simulator build with an embedded Hermes bundle completed, installed, launched as `com.questhat.app`, remained registered, and rendered the live home feed. No missing-bundle, fatal JavaScript, or crash message was observed. The simulator logged its expected notification-keychain limitation.
- Preserved defaults: post-quest follow-ups and native feedback remain disabled; analytics remains opt-in; replay remains off; the support action remains `mailto:`.
- Scope: local integration, archive, export, and validation only. No upload, submission, push, deployment, or production migration occurred.

This build 128 record supersedes the build 127 release claim below for the integrated source. The build 127 artifacts and notes remain preserved as historical evidence only and must not be represented as current for the integrated canonical source.

## Historical build 127 artifact

- Archive: `/Volumes/My Passport/Codex/questhat-local-build-1.0.1-127/archives/QuestHat-1.0.1-127-final.xcarchive`
- IPA: `/Volumes/My Passport/Codex/questhat-local-build-1.0.1-127/export-final/QuestHat.ipa` (preserved; it does not contain the later local media/dependency work)
- Version/build: `1.0.1 (127)`
- IPA SHA-256: `d371d0db3502e619fc2cb2553854bb643f5c8103c5f0ca3aa6eb924b10656813`
- Embedded bundle SHA-256: `235297fccf27d663e638d03c38e3799d6bba3bda5bd3f156342514aae289907a`
- Scope: local signed archive/export only. It was not uploaded, submitted, or deployed.

## Refreshed local artifact

- Archive: `/Volumes/My Passport/Codex/questhat-local-build-1.0.1-127/archives/QuestHat-1.0.1-127-final-security-validated.xcarchive`
- IPA: `/Volumes/My Passport/Codex/questhat-local-build-1.0.1-127/export-final-security-validated/QuestHat.ipa`
- Version/build and bundle identifier: `1.0.1 (127)`, `com.questhat.app`
- IPA SHA-256: `2ce298941f907834093a66cf3cb68e44cf67500a1029a50f058926f4c8067eb6`
- Embedded executable SHA-256: `1a617d7b19f8ab0801f6c9b7b9948922078323435d77413a4bb702ec2812701d`
- Verification: `codesign --verify --deep --strict` passed. **Do not upload this refreshed IPA:** a post-export inspection could not find the required non-secret Supabase project marker (`ipjewvmmzmxakoewqlfo`) in the embedded Expo plist manifest or Hermes bytecode bundle. The local source `app.json` has that URL, so the remaining blocker is build-time Expo configuration injection. This local export was not uploaded, submitted, or deployed.

## Verified runtime-configured local artifact

- Archive: `/Volumes/My Passport/Codex/questhat-local-build-1.0.1-127/archives/QuestHat-1.0.1-127-final-runtime-configured.xcarchive`
- IPA: `/Volumes/My Passport/Codex/questhat-local-build-1.0.1-127/export-final-runtime-configured/QuestHat.ipa`
- Version/build and bundle identifier: `1.0.1 (127)`, `com.questhat.app`
- IPA SHA-256: `91c9c39100b446d0ce79bd36b0cb16d38cfdd0c4caa5765498bd7459f3f33bfb`
- Embedded executable SHA-256: `d5e483d367f9529673d3440a8cf18e23af91456f11b9feb21132ae87f211623b`
- Verification: `codesign --verify --deep --strict` passed. The exported IPA contains `EXConstants.bundle/app.config`; the deterministic configuration check confirms both required Supabase settings are present and the post-quest follow-up/native-feedback flags remain disabled. The non-secret project marker is present in that packaged file.
- Root cause and prevention: Expo Constants split the external-drive path at the unquoted `$PROJECT_DIR`, then exited as though it were not a Pods build; it also assumed the shallow bundle directory existed. The persistent `expo-constants` patch quotes the path and creates the bundle directory. `npm run mobile:ios:config-check` now verifies source or packaged `app.config` without exposing values.
- Scope: local signed archive/export only. It was not uploaded, submitted, or deployed.

## Evidence checklist

| Workstream | Local/source evidence | Server or device evidence | Current state |
| --- | --- | --- | --- |
| 1. Interests, shared links, auth return | Account-scoped interest persistence; `auth-return` and public-deep-link tests pass. | Signed-out/device navigation not run. | Source-tested. |
| 2. Diagnostics and analytics privacy | Sentry scrub/replay-off and consent-gate tests pass. | Sentry read-only query saw one development event in the last seven days; no final-build production event test. | Partial external evidence. |
| 3. Discovery/join/host metrics | Native coarse discovery and host review events tested; dashboard review document added. | No PostHog event query/dashboard verification. | Source-tested; dashboard blocked on approval. |
| 4. Abuse controls and RLS | Rate-limit/RLS migration contracts tested. | Deployment of migration, Turnstile flow, alert delivery, and Cloudflare rate rules not tested. | Local-only/unapplied. |
| 5. Post-quest follow-up | Completion, private rating, neutral review, and no-penalty tests pass. | Migration unapplied; feature disabled. | Local-only/off. |
| 6. Private experience history | Requested/approved/hosted/left/unknown/disputed tests pass. | Migration unapplied. | Local-only/unapplied. |
| 7. Feedback/abuse/suggestions | Durable reservation and explicit diagnostics tests pass. | Feedback migration unapplied; native CAPTCHA cannot be completed. | Local-only/partially blocked. |
| 8. Identity readiness | No-vendor readiness and decision gates documented. | No vendor review or staging test. | Planning only. |

## Morning actions (in order)

1. Resolve the remaining 32 dependency advisories through a coordinated Expo/React Native upgrade, or make an explicit release-exception decision. Targeted local work removed the two critical findings but did not make the SDK graph release-clean.
2. In Supabase staging, apply and test the four reviewed migrations in dependency order: abuse limits, post-quest follow-ups, private experience history, and feedback intake. Do not apply directly to production without the approved migration plan and rollback owner.
3. Verify the replacement 128 IPA on a physical iPhone: signed-out listing-to-join return, interest save/reload, open and approval-required joins, host approval, first-guest metric, feedback error/retry, and `.webm` fallback. This is not covered by source tests or the simulator smoke.
4. Configure and test a supported native CAPTCHA design before enabling any Auth or feedback CAPTCHA requirement for native. It needs an approved public site-key delivery path and a trusted hosted callback/origin; do not use an opaque inline WebView workaround.
5. Query PostHog using a consenting test account, verify only the approved coarse event properties, and create the city dashboard only after privacy/legal approval of aggregate source, threshold, retention, and access.
6. In Sentry, verify an event from this final release in the intended environment; separately review the organization-wide server-side privacy settings because source scrubbing does not replace an account-level data-scrubbing policy.
7. Verify Cloudflare production variable names/availability for the web Turnstile public site key and the desired PostHog host; secret values must remain unread. Confirm moderation recipients and a non-production alert delivery test.
8. Reassess media: iOS AVFoundation does not decode `.webm`; replace/convert affected media or accept the explicit fallback after physical-device verification.

## Explicit non-results

No production migration, Cloudflare configuration change, Sentry setting change, PostHog dashboard creation, provider credential change, build upload, or App Store submission occurred in this pass.

## Follow-up local work

- The iOS feed now detects `.webm` URLs and shows a poster/status fallback before creating an iOS video player. It does not make `.webm` playable; physical-device playback coverage is still required for supported formats.
- Targeted dependency work removed all critical audit findings. See `docs/dependency-security-triage-2026-10-12.md`; the coordinated Expo/React Native SDK upgrade remains engineering work, not a user decision.
- The historical build 127 lint record covered 303 source tests. The integrated build 128 replacement covers 308 source tests, mobile typecheck, lint with warnings only, a web production build, runtime-config validation, signed archive/export, and a Release simulator smoke. Neither artifact was uploaded, submitted, or deployed.
- Static SQL/RLS review covered the prepared follow-up, private-history, and feedback-intake migrations: each enables RLS, revokes direct table access, uses `security definer` functions with fixed search paths and `auth.uid()` checks where applicable, and grants only intended authenticated RPC execution. The related local contract suite passed 18/18. This is not a substitute for SQL parsing or staging runtime validation.
- Additional local runtime coverage verifies interest-write ordering and account scope, cancellation-safe/single-use auth returns, analytics withdrawal after an account switch, actor-scoped feedback fingerprints, and native dashboard payload schemas. These checks do not simulate React Native UI, a real identity provider, PostHog ingestion, or a running Postgres policy engine.
