# QuestHat Launch Checklist

Use this before promoting a deployment from preview/staging to production.

## Required Environment Variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SITE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
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
npm audit --audit-level=high
```

Expected status:

- Tests pass.
- Lint has no errors. Warnings must be triaged before launch.
- Production build passes.
- High-severity audit passes. Current Next may still report a moderate nested PostCSS advisory until an upstream patched Next release is available.

## Cloudflare Preview Smoke Test

On a Cloudflare Pages preview using production-like environment variables:

- Public pages load: `/`, `/privacy`, `/terms`, `/tos`, `/delete-account`, `/robots.txt`, `/sitemap.xml`.
- Unauthenticated protected views redirect or prompt for sign-in: `/inbox`, `/settings`, `/profile`, `/notifications`, `/joined`.
- Email magic-link auth works from the deployed domain.
- Google, Facebook, and Apple auth providers either work or are intentionally hidden/disabled.
- New user onboarding creates a profile, username gate works, and welcome email sends once.
- Turnstile verifies on signup, quest creation, and report flows.
- Quest creation, edit, delete, join request, approval, leave, and block flows work.
- Public and private messages appear in listing pages, inbox, and notifications.
- Profile photo, listing media, and listing video uploads render from Supabase storage.
- Report submission creates a moderation record and sends moderation email.
- Account deletion and Facebook data deletion endpoints return expected responses.
