# Privacy collection review — 17 October 2026

Status: implementation and declaration preparation only. The new city migration, client changes and policy text have not been deployed. Store declarations have not been submitted. Current released clients are iOS 133 and Android 18; web is ab69556. Do not represent this document as a platform certification.

## Approved city reports

Separate account-level opt-in and a city typed for this purpose; local optional analytics must also be enabled. No profile-city inference, geocoder, IP-derived city or GPS input. Daily internal counters are account-linked, not anonymous. Only fixed metric names are accepted. No quest IDs, messages, addresses or event content are recorded in these counters.

Private-schema tables have RLS and no direct client grants. Actor-scoped RPCs reject a mismatched authenticated actor and inactive profiles. Existing active admin/super-admin staff with verified MFA can request a fixed report for three completed UTC weeks. Each city/week/metric requires five distinct consenting accounts. Both account and event counts round down to multiples of five; suppressed is not zero. No individual drill-down or arbitrary date filters.

Daily counters expire after 30 days at hourly cleanup, within 31 days. Changing city clears old counters; withdrawal and account deletion remove them. The explicit preference remains until changed, withdrawn or account deletion. Device analytics opt-out stops future contributions from that device; the separate account control removes stored city contributions across devices.

## Collection inventory and declaration preparation

| Actual flow | Data / purpose | Declaration considerations |
| --- | --- | --- |
| Supabase account and profile | Email, account ID, profile name/avatar/bio, birthday and optional gender; authentication and app functionality | Linked contact information, identifiers, profile/user content; do not describe as anonymous |
| Quests, messages, comments, uploads, reports and follow-ups | User content, participants, private feedback and moderation records; app functionality/safety | Messages, photos/videos and other user content; private does not mean uncollected |
| Location features | Meetup locations/addresses; optional People discovery stores precise coordinates and clears them when disabled; check-in validates transmitted coordinates but persists status/time rather than coordinates | Precise/coarse location, functionality. City reports do not replace or negate existing location disclosures |
| Optional PostHog | Account identification plus SDK device/session identifiers, coarse interaction events and timestamps; analytics | Linked/pseudonymous product interactions and identifiers. Browser SDK network IP and legacy GeoIP were observed. New source requests GeoIP disable; this is not proof that network IP is neither processed nor retained |
| Sentry | Crash/performance diagnostics, device/runtime context and readable source frames; reliability | Crash logs, performance/other diagnostics, applicable identifiers. Replay remains off. New native scrubber removes identity/content/request payloads and error text; not yet shipped |
| City reports | Explicit city, account ID, preference time, daily fixed counters | City with geographic meaning is coarse/approximate location; account-linked product interaction. Optional, analytics purpose. Suppression alone does not anonymize source records |
| Push / Live Activities | Device delivery tokens and quest context; requested functionality | Device identifiers and applicable app interactions/content |
| External lookups and integrations | Typed city queries to Open-Meteo; selected map searches/network requests; chosen social sign-in/publishing providers | Verify each enabled integration and processor terms. No contact-book import or advertising-ID integration was identified; do not infer their absence solely from this table |

Apple preparation: review Coarse Location, Precise Location, User ID/Device ID, Product Interaction, Crash Data, Performance Data, Other Diagnostic Data, contact information and user-content categories against all shipping flows. Account-linked PostHog does not meet an unlinked product-improvement exception merely because collection is optional.

Google preparation: review Approximate/Precise Location, User IDs, Device or Other IDs, App Interactions, Crash Logs/Diagnostics, contact information and user-content categories. Pseudonymous off-device SDK traffic is collection. The service-provider exception to sharing requires qualifying actual terms/use; it does not remove collection. A category is optional only if every applicable user can avoid all collection of that category.

## Deletion and unresolved provider settings

The deployed account-deletion function validates the caller, deletes user-owned media, disables profile/push and deletes the authentication account; first-party foreign-key cascades remove dependent records. It does not currently call PostHog or Sentry erasure APIs. Do not claim automatic external-provider deletion. Provider retention periods, deletion workflow and PostHog's project-level Discard client IP data setting still require verification. No new provider key, access grant, paid service or broader collection was introduced.

Before submission: reconcile the complete console questionnaires with actual shipped versions and provider contracts/settings; verify photo/video/audio and social graph taxonomy where applicable. Any new legally consequential certification or agreement must be presented to the owner before submitting it. No such certification was accepted here.

## Primary guidance

- [Apple app privacy details](https://developer.apple.com/app-store/app-privacy-details/)
- [Google Play Data safety](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en)
- [Google Play User Data policy](https://support.google.com/googleplay/android-developer/answer/10144311?hl=en)
- [PostHog property redaction and IP guidance](https://posthog.com/tutorials/web-redact-properties)
