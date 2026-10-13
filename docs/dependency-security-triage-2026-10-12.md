# Dependency security triage — 2026-10-12

## Recheck — 2026-10-12

- `npm audit --omit=dev --json` reports `26 high`, `0 critical` production dependency advisories.
- `npm audit fix --omit=dev --dry-run` is not a targeted patch: it proposes a broad Expo/React Native/Metro graph change (including Expo 57 point releases and React Native 0.86 transitive packages), as well as direct MapLibre and date-picker changes. It was intentionally **not applied**.
- Rationale: applying that graph without a compatibility pass and a fresh native archive would be a framework-level release change. The verified `1.0.1 (127)` IPA remains current because no dependency change was made.

## Remediated locally

| Finding | Exact path | Change | Validation |
| --- | --- | --- | --- |
| Next.js RCE/image findings | direct `next` production dependency | `16.2.12` → `16.4.0` | Production build, mobile typecheck, and 298 source tests pass. Current repository-wide lint has 28 errors outside this targeted work that must be resolved/baselined before a clean release validation. |
| Sharp native library findings | `next → sharp`, previously held by root override | root override `0.35.3` → `0.35.5` | Resolved lockfile version verified; production build passes. |
| shell-quote command injection | development-only `react-native → react-devtools-core → shell-quote` | dev dependency locked to `1.12.0` | Resolved lockfile version verified; source tests pass. |

Audit moved from **35 total / 2 critical / 32 high / 1 moderate** to **32 total / 0 critical / 31 high / 1 moderate**.

The release-runtime view (`npm audit --omit=dev --audit-level=high`) now reports **26 high / 0 critical** findings. The remaining runtime paths are detailed below; no `--force` remediation was applied.

The 26 remaining runtime findings split into two groups:

- **Coordinated framework graph:** direct Expo 57, React Native 0.86, MapLibre, DateTimePicker, and Sentry React Native paths flow through Expo CLI/Metro/React Native. npm's offered remediations replace that graph with incompatible Expo 44 or React Native 0.72 versions, so they are not valid patch updates.
- **Patch-available transitive tooling:** `@xmldom/xmldom`, `brace-expansion`, Browserslist, compression, image-size, js-yaml, and source-map-js are reached via Expo/config/build tooling. A dry-run `npm audit fix` proposed a broad lockfile rewrite with removals and incompatible framework changes rather than a bounded patch-only set. No override was applied because that result is not a safe or testable targeted remediation.

## Remaining findings and reachability

The remaining high findings are not independent production packages that can be safely bumped one at a time. They are mostly a coordinated Expo 57 / React Native 0.86 build-toolchain graph:

- Expo, Metro, React Native, Sentry React Native, MapLibre, and DateTimePicker findings are tied to Expo/RN peer compatibility. npm proposes incompatible major/downgrade versions (for example Expo 44 or React Native 0.72), which must not be force-applied.
- `@expo/cli`, Metro, micromatch/braces, node-forge, XML tooling, and related entries are build/developer-tool reachability rather than shipped web-server runtime code. They still require a coordinated SDK update, but should be prioritized separately from deployed server exposure.
- `eslint-config-next`, patch-package, browserslist, image-size, js-yaml, and source-map-js are development/build paths. They are not an excuse to omit the planned dependency upgrade, but do not independently justify a production binary change.

## Safe remediation plan

1. Create a dedicated Expo SDK/RN upgrade branch with an Expo compatibility matrix; update Expo-managed packages together, not through `npm audit fix --force`.
2. Regenerate iOS pods and Android Gradle dependencies in that branch, then run device regression coverage for maps, media, notifications, authentication, calendar, and Sentry.
3. Re-run audit and remove any no-longer-needed overrides. Do not retain vulnerable overrides merely to stabilize a build.

## Supabase test-environment check

This workspace has `supabase/config.toml`, but no Supabase CLI is installed and Docker is not running, so no existing isolated local stack is available. No migration/schema/RLS command was run against any remote project.

Static review remains meaningful but is not functional database verification: the rate-limit migration uses per-actor advisory locks and revokes default table/function access; post-quest, private-history, and feedback migrations use security-definer functions with `auth.uid()` checks and explicit grants. Existing source-contract tests cover these intended controls. A local or staging Supabase stack is still needed to validate SQL parsing, migration order, policies, and RPC behavior.
