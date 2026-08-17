# QuestHat Launch Checklist

Use this before promoting a deployment from preview/staging to production.

## Required Environment Variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SITE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `FACEBOOK_APP_SECRET` (server-only; must match the Facebook Login app)
- `SECURITY_AUDIT_IP_HASH_SALT` (recommended, rotate carefully)
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
- `TURNSTILE_SECRET_KEY`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASSWORD`
- `SMTP_FROM`
- `MODERATION_ALERT_RECIPIENTS`

For Supabase Edge Functions, also confirm:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `MODERATION_ALERT_RECIPIENTS`

## Database And Storage

Apply the baseline schema and every migration in `sql/` to the production Supabase project. The app depends on the later migrations, not only `supabase-schema.sql`.

Required storage buckets:

- `profile-photos`
- `quest-media`
- `quest-videos`

Required feature areas from migrations:

- Bookmarks and inbox visibility
- Friends, blocks, and message visibility
- Join approval and exact-location privacy
- Listing media gallery and quest videos
- Creator quest delete policy
- Moderation reports, actions, email queue, and dispatch
- Security audit events and media ownership records
- Security audit retention cleanup
- Notifications and notification state
- Onboarding, usernames, profile photos, and welcome email flags
- Anti-spam rate limits

## Local Verification

Run:

```bash
npm test
npm run lint
npm run build
npm run audit:release
```

Expected status:

- Tests pass.
- Lint has no errors. Warnings must be triaged before launch.
- Production build passes.
- Production dependencies have no high-severity advisories. Development-only tooling advisories are tracked separately and must not be force-fixed with incompatible major downgrades.

## Cloudflare Preview Smoke Test

On a Cloudflare Pages preview using production-like environment variables:

- Public pages load: `/`, `/privacy`, `/terms`, `/tos`, `/delete-account`, `/robots.txt`, `/sitemap.xml`.
- Unauthenticated protected views redirect or prompt for sign-in: `/inbox`, `/settings`, `/profile`, `/notifications`, `/joined`.
- Email magic-link auth works from the deployed domain.
- Google, Facebook, and Apple auth providers either work or are intentionally hidden/disabled.
- New user onboarding creates a profile, username gate works, and welcome email sends once.
- Turnstile verifies on signup, quest creation, and report flows.
- Cloudflare rate-limiting rules protect `/api/turnstile/verify`, `/api/report-alert`, and authentication callback traffic from IP-level floods.
- Supabase migration `20260731143000_abuse_rate_limits_and_media_caps.sql` is applied so direct web/mobile database writes receive server-side cooldowns.
- Quest creation, edit, delete, join request, approval, leave, and block flows work.
- Public and private messages appear in listing pages, inbox, and notifications.
- Profile photo, listing media, and listing video uploads render from Supabase storage.
- Quests reject a fourth media item and storage rejects oversized, unsupported, or over-quota uploads.
- Report submission creates a moderation record and sends moderation email.
- Account deletion and Facebook data deletion endpoints return expected responses.
- Meta Facebook Login settings use `https://questhat.com/privacy` for Privacy Policy, `https://questhat.com/delete-account` for deletion instructions, and `https://questhat.com/api/facebook-data-deletion` for the Data Deletion Request Callback.
- Meta App Domains and Valid OAuth Redirect URIs exactly match the production QuestHat web and Supabase callback domains.
- Facebook Login requests only `public_profile` and `email` unless additional reviewed permissions are genuinely used.
- A signed Meta deletion test produces a real confirmation URL and the status page reports completion.

## Meta / Facebook Login dashboard

- Use a dedicated consumer-login Meta app for QuestHat. Keep Page publishing, Page insights, and ads in a separate business-management app.
- App mode is **Live** only after the icon, category, privacy-policy URL, terms URL, data-deletion instructions URL, support email, and required business details are complete.
- Facebook Login has only the exact production OAuth redirects used by Supabase and QuestHat. HTTPS is required outside local development.
- Supabase Authentication contains the same current Meta App ID and App Secret as the consumer-login app.
- The Cloudflare production secret `FACEBOOK_APP_SECRET` contains that same app secret and is never exposed through a `NEXT_PUBLIC_` variable, mobile bundle, repository, log, or screenshot.
- Consumer login requests only `public_profile` and `email`. If Meta does not return an email, QuestHat asks the member to add a verified recovery email.
- The Data Deletion Request Callback is `https://questhat.com/api/facebook-data-deletion`; the public instructions URL is `https://questhat.com/delete-account`.
- Test Meta's data-deletion callback with a signed test request and confirm that its returned `url` loads a `Completed` status. Confirm quests, messages, comments, memberships, notifications, profile records, auth identity, and uploaded media are gone.
- Test direct deletion from both website and iOS Settings. A media-cleanup error must not be displayed as successful deletion.
- Complete Meta App Review for every permission beyond basic login before requesting it, and remove unused permissions/products.
- Complete required Meta Data Use Checkups and business verification before their deadlines. Keep at least two trusted business admins with two-factor authentication and current recovery contact details.
- Verify the Privacy Policy, Terms, deletion instructions, support email, app domains, OAuth redirects, and screencast/reviewer instructions from a signed-out browser before each Meta review.
