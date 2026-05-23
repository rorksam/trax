# Project Log

## 2026-05-22

**Requirements & Architecture**

Wrote `project_context.md` — full design doc covering goals, data model, habit types, day boundary logic (4am local cutoff), privacy/visibility model, friend system, feed design, notifications (15-min worker pattern), and build order. Intentional cuts documented (per-friend visibility, email reminders, gamification, leaderboards).

---

## 2026-05-23

**Scaffold**

- Initialised Vite + React + TypeScript project (`trax`)
- Installed core dependencies: `@supabase/supabase-js`, `date-fns-tz`, `react-swipeable`, Tailwind CSS
- Ran `supabase init`; tuned `supabase/config.toml` to point at Vite's dev port 5173
- Populated `.env.local` with local Supabase stack values; added `.env.example`
- Added `db:start` / `db:stop` / `db:status` / `db:reset` scripts to `package.json`
- Confirmed `supabase start` brings up local stack cleanly

**Planning**

- Reviewed step 1 of build order (auth + user setup + timezone capture + default visibility)
- Agreed on: email/password auth, trigger-based `public.users` row creation, `timezone IS NULL` as onboarding gate, display name collected in onboarding not signup
- Pending sign-off before writing migration or React code
