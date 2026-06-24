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
  - For moderation email dispatch:
    - `SMTP_HOST`
    - `SMTP_PORT`
    - `SMTP_USER`
    - `SMTP_PASSWORD`
    - `SMTP_FROM` (optional)
    - `MODERATION_ALERT_RECIPIENTS` (optional; defaults to `reportsreportteam@questhat.com`)
3. Run the SQL file in Supabase SQL editor:
   - `supabase-schema.sql`
4. Start dev server:
   ```bash
   npm run dev
   ```

## Notes
- Auth is email magic link (`signInWithOtp`).
- This is intentionally lean for v1 validation.
- Next step: add dedicated chat screen + onboarding wizard + reliability score.
