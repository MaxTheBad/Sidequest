# Release QA - 2026-07-31

## Automated Gates

- Production dependency audit: pass; no high-severity production dependency advisories.
- Unit tests: pass, 12 of 12.
- Mobile TypeScript check: pass.
- Web production build: pass.
- ESLint: pass with 125 pre-existing warnings and no errors.
- iOS Expo export: pass.
- iOS Release simulator build: pass.

## Production Functional Checks

- Test-account email/password login: pass.
- Signed-in home feed and account state: pass.
- Notifications load with direct links to listings and private message threads: pass.
- Inbox threads load: pass.
- Joined screen loads: pass.
- Settings profile, account, preferences, friends, and blocked tabs load: pass.
- Temporary deactivation and permanent deletion controls are present: pass.
- Non-moderator access to `/moderation` is denied: pass.
- Browser console errors on checked notifications and inbox paths: none.
- Native map geocoding: pass after bounding geocoder concurrency and adding city/postal fallbacks; 32 of 42 current quests map successfully.
- Ten current quests remain unmapped because their stored location is blank, virtual, or malformed.
- Web Settings does not yet expose the native per-category notification controls; this is a web parity gap, not an iOS release blocker.

## Moderation Operations

- Active super-admin staff assignment exists: pass.
- Non-staff role boundary: pass.
- Live Cloudflare SMTP moderation alert delivery: pass.
- MFA requirement is enforced in database policies and moderation RPCs: verified from deployed schema.
- Six historical test reports remain open beyond the 24-hour SLA and require an MFA-authenticated moderator decision.
- The successfully tested alert was marked delivered; seven older queue rows remain pending.
- The Supabase fallback email worker has no SMTP configuration; Cloudflare is the working primary alert channel.
- Alert queue accounting/idempotency fix is implemented locally and must be deployed before release.

## Data Migration

- A migration now backfills the single unique public profile name for legacy accounts and aligns `display_name` with `username`.
- The supplied QA account was corrected directly so native profile testing could continue.
- The migration has not been applied to the linked production database because the local Supabase CLI credential store remained unavailable during this run. Apply and verify it before release.

## App Store Draft

- Listing copy, keywords, review notes, age-rating guidance, and a five-shot storyboard are drafted under `release/app-store`.
- Five iPhone 6.9-inch screenshots were captured at 1320 x 2868 pixels.
- Nothing was uploaded, submitted, or published in App Store Connect.

## Remaining Manual Soak

- Complete 24-48 hours on a physical iPhone using the latest TestFlight build.
- Verify background push delivery for messages, comments, join requests, and approvals while the app is closed.
- Verify badge increments, decrements after reading, and survives app relaunch.
- Verify notification taps open the exact conversation or quest.
- Record crash-free sessions and test poor-network recovery.
- Resolve or dismiss every historical moderation report through the MFA-protected dashboard.
