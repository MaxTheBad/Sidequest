# Thanos reconciliation plan — 2026-10-12

> Historical planning snapshot. The reviewed candidate was integrated into the canonical checkout on 2026-10-13 after an external backup and exact 74-path manifest were created. The validated local replacement is build 128; build 127 is retained only as historical evidence. No push, upload, deployment, or production migration occurred.

## Snapshot

- Canonical checkout: `/Users/clawd/.openclaw/workspace-control/sidequest`
- Integration checkout: `/Volumes/My Passport/Codex/questhat-release124-integration-20261011`
- Shared committed base: `f98bd9ce5c4daf6ee2f46395593aa7b89d5330a6`
- Both checkouts are dirty. No reset, stash, overwrite, copy, commit, push, or merge was performed.

## Reconcile by review set

| Set | Examples | Action |
| --- | --- | --- |
| Canonical-only operational/marketing material | `.expo/`, Google Play graphics and AABs, `host-the-table/`, `output/`, an iOS project backup | Preserve in canonical; do not move release binaries or generated output into integration source. Review marketing assets separately. |
| Shared overlapping product work | `apps/mobile/app.json`, iOS project/Info.plist, `App.tsx`, create/listing/settings pages, shared catalog and TikTok files | Produce per-file three-way diff against the common base, resolve deliberately, then run targeted tests. Do not bulk-copy either worktree. |
| Integration-only defense/release work | Expo Constants patch, runtime config check, feedback/auth/metrics/privacy helpers, additional migrations and contract tests, release-readiness documents | Keep in integration for review. The runtime-config patch is included in the verified local build 127. |
| Integration-only dependency/build metadata | root/mobile package manifests, lockfile, Metro config, Podfile lock, app config | Review together as one dependency/build set; applying only a subset can invalidate the verified build. |

## Safe transfer sequence

1. Freeze a file inventory from both dirty worktrees and save separate patches for each review set.
2. Review overlapping tracked files against the shared base, beginning with mobile config and `App.tsx` because they affect the local iOS artifact.
3. Apply one reviewed set to a new integration branch/worktree, not the canonical checkout.
4. Run source tests, mobile typecheck, and a fresh archive/config verification after any mobile dependency or runtime-config change.
5. Only after those checks pass should a human authorize a canonical merge or release build replacement.

## Build status

At the time this plan was written, `1.0.1 (127)` was the current integration artifact. It is now superseded by the locally validated `1.0.1 (128)` archive/export recorded in `docs/release-readiness-2026-10-12.md`. Any later mobile, runtime, or dependency source change requires another build number, archive, export, and packaged-config verification.
