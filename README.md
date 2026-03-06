# Side Quest (v1)

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
   - `SUPABASE_SERVICE_ROLE_KEY` (server-only; not exposed in browser)
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
