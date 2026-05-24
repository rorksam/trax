# Project Log

## 2026-05-22

**Requirements & Architecture**

Wrote `project_context.md` — full design doc covering goals, data model, habit types, day boundary logic (4am local cutoff), privacy/visibility model, friend system, feed design, notifications (15-min worker pattern), and build order. Intentional cuts documented (per-friend visibility, email reminders, gamification, leaderboards).

---

## 2026-05-23 Session 1

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

---

## 2026-05-23 Session 2

**Build steps 1–4 completed**

**Step 1 — Auth + user setup**
- Migration: `public.users` table with `SECURITY DEFINER` trigger auto-creating a profile row on signup; RLS (self read/update only)
- Added `react-router-dom`; wired routing: `/login`, `/signup`, `/onboarding`, protected routes
- `AuthContext` manages session + profile with correct loading state (fixed race condition where profile fetch after login caused redirect to onboarding)
- Onboarding collects display name, timezone (auto-detected via `Intl`), and default habit visibility
- Fixed `verbatimModuleSyntax` type import issues throughout (`Session`, `ReactNode`, `FormEvent`)

**Step 2 — Habit CRUD**
- Migration: `public.habits` table with category/type/target/visibility columns; RLS (self CRUD)
- Added `@dnd-kit` for drag-to-reorder
- `HabitsPage` + `HabitForm`: create, edit (cosmetic vs. substantive branch — substantive edits archive old row and create new), drag-to-reorder, delete with confirmation dialog
- Delete is smart: hard deletes if no logs exist, silently archives if logs are present — user sees one "Delete" action throughout
- Range habit validation: rejects min ≥ max before submit

**Steps 3+4 — Daily logging + day boundary**
- Migration: `public.logs` table (UNIQUE on habit+date); `effective_date(tz text)` Postgres function (day ends at 4am local time)
- Client-side `getEffectiveDate` helper in `src/lib/effectiveDate.ts` using `date-fns-tz`, matches Postgres logic exactly
- `LoggingPage` fetches today's habits and logs in parallel, joins client-side
- `HabitLogRow`: swipe right = complete, swipe left = skip (binary/avoid); swipe same direction = undo; swipe opposite = swap. Quantity habits: swipe right opens input, swipe left clears log
- Tap-to-expand shows explicit Skip/Complete buttons (desktop + accessibility fallback); click-outside collapses
- Status dots: `●` complete, `◐` partial, `○` skipped, `—` none
- Avoid habits show "Avoided" instead of "Complete" in expanded state
- Bottom nav (Today / Manage habits) via `Layout` component wrapping all protected routes

**Fixes & UX polish**
- Wired up Tailwind v4 properly (plugin in `vite.config.ts`, `@import "tailwindcss"` in CSS); stripped conflicting Vite boilerplate global styles that caused near-invisible text in dark mode
- Dark purple page background (`#1e1b2e`); white cards float on top; page titles white
- Swipe zone scoped to header row only — clicks on expanded buttons/inputs no longer trigger `onTap` and close the row
- Quantity undo: swipe left clears, Clear button visible when a value is logged
- Skipped vs. none visually distinct (darker background + different dot character)
- Button order matches swipe directions: Skip (left) | Complete (right)
- Delete confirmation: first click arms, second confirms

**Next up:** step 5 — friendships + invite links

---

## 2026-05-24

**Build steps 5–6 completed**

**Step 5 — Friendships + invite links**
- Migration: `friendships` (composite PK, `CHECK user_a_id < user_b_id`, `ON DELETE RESTRICT`) and `invites` tables with RLS; expanded `users` SELECT policy so friends can read each other's display names
- `generate_invite()` SECURITY DEFINER RPC: atomically revokes all active invites for caller, creates new 24-char hex token (via `gen_random_uuid()`) with 3-day expiry; `accept_invite(token)` RPC: validates (exists / not revoked / not expired / not self-invite), inserts friendship with correct `user_a_id < user_b_id` ordering, `ON CONFLICT DO NOTHING` makes double-acceptance a no-op
- Separate GRANT migration required — Supabase local stack revokes PUBLIC execute on functions by default
- `FriendsPage` (`/friends`): invite link section (generate / copy / revoke, expiry display); friends list with arm-then-confirm-with-cancel remove flow
- `/invite/:token` public route: unauthenticated users have token stored in `sessionStorage` and are redirected to `/login`; after login or onboarding, pending token is consumed and friendship created; success redirects to `/friends?added=1` with banner
- Nav expanded to Today | Habits | Friends

**Step 6 — Feed**
- Migration: `blurbs` table (`UNIQUE(user_id, for_date)`, 140-char CHECK); RLS policies allowing friends to SELECT non-hidden non-archived habits and their logs — hidden habit logs never reach the client
- `BlurbInput` component at top of Today page: auto-saves on blur, pre-populates from DB, shows char counter under 40 remaining
- `FeedPage` (`/feed`): live query — fetches friend IDs → visible habits → last-7-days logs + blurbs → computes one card per friend (most recent logged date); sorted by logged-late first, then most recent `logged_at`, then alphabetical
- Card rendering: category sections with green/amber/gray headings; `detailed` habits show name + dot; `aggregated` habits collapsed to a single `● ◐ · N habits` summary line
- `StatusDot` shared CSS circle component: `w-2.5 h-2.5 rounded-full` for all states — eliminates Unicode character size inconsistency. `noneStyle='dash'` variant used in Today (dash = not yet logged, circle = skipped); feed always uses circle
- Dev panel (DEV-only, bottom of Feed): date picker + Seed complete (`ignoreDuplicates` — preserves existing log states) + Clear logs + Seed today shortcut
- Nav expanded to Today | Habits | Friends | Feed

**Fixes**
- Quantity habit outside-click: changed `mousedown` → `pointerdown` for mobile compatibility; extracted `saveQuantityValue(val)` so outside-click handler can save via ref without stale closure
- `formatFeedDateLabel` added to `effectiveDate.ts` using UTC arithmetic to avoid DST edge cases

**Next up:** step 7 — push notifications + 15-minute worker, or settings page (logout, timezone, habit archive) depending on priority
