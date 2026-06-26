# QuestHat (v1)

MVP app: find hobby partners/groups, post quests, join quests, and use a Surprise Me suggestion.

## Stack
- Next.js (App Router)
- Supabase (Auth + Postgres)

## Quick start
1. Install deps
   ```bash
   npm install
   ```
2. Add env vars in `.env.local`
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `NEXT_PUBLIC_SITE_URL` - set this to the canonical app URL, for example `https://questhat.com`
  - `SUPABASE_SERVICE_ROLE_KEY` (server-only; not exposed in browser)
  - `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
  - `TURNSTILE_SECRET_KEY`
  - For moderation email dispatch:
    - `SMTP_HOST`
    - `SMTP_PORT`
    - `SMTP_USER`
    - `SMTP_PASSWORD`
    - `SMTP_FROM` (optional)
    - `MODERATION_ALERT_RECIPIENTS` (optional; defaults to `reports@questhat.com`)
3. Run the SQL files in Supabase SQL editor:
   - `supabase-schema.sql`
   - every file in `sql/` that has not already been applied to the target Supabase project
4. Start dev server:
   ```bash
   npm run dev
   ```

## Launch checks

Use `LAUNCH_CHECKLIST.md` before a public launch. The short local gate is:

```bash
npm test
npm run lint
npm run build
npm audit --audit-level=high
```

## Notes
- Auth is email magic link (`signInWithOtp`).
- This is intentionally lean for v1 validation.
- Next step: add dedicated chat screen + onboarding wizard + reliability score.
