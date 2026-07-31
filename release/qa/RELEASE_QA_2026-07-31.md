# Release QA - 2026-07-31

## Automated Gates

- Production dependency audit: pass; zero production dependency advisories.
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
- Six historical QA reports were dismissed with super-admin attribution and matching audit actions; zero active reports remain.
- Seven obsolete alerts for already-reviewed reports were explicitly suppressed; zero moderation alerts remain pending.
- The Supabase fallback email worker has no SMTP configuration; Cloudflare is the working primary alert channel.
- Alert queue claim/accounting logic is idempotent in the production code path.

## Data Migration

- A migration now backfills the single unique public profile name for legacy accounts and aligns `display_name` with `username`.
- The supplied QA account was corrected directly so native profile testing could continue.
- The single-name migration is deployed and verified in production: zero profiles are missing usernames and zero profile-name mismatches remain.
- The anti-spam migration is deployed and verified in production: all three abuse triggers and the media constraint are active, fourth media is rejected, and both media buckets enforce 60 MB/MIME restrictions.
- Supabase migration history records both production-applied migration versions.

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
