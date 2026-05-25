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

---

## 2026-05-25

**Settings page**

- `SettingsPage` (`/settings`): Account section (display name inline edit, sign out), Preferences section (timezone text input, default habit visibility radio), Archived Habits section (list with Restore button)
- Restore appends to bottom of active sort order (MAX sort_order + 1)
- All fields auto-save on blur/change with a 2-second "Saved" flash inline
- No migration needed — all writes are to existing `users` and `habits` tables with existing RLS
- Nav expanded to Today | Habits | Friends | Feed | Settings

**Step 7 — Push notifications + 15-minute worker**

- Migration: `notification_preferences` (PK user_id+type, defaults seeded by trigger + INSERT for existing users), `push_subscriptions` (UNIQUE on endpoint), `notifications_log` (UNIQUE dedup key user_id+type+fire_date); RLS on all three; pg_cron + pg_net extensions enabled
- `find_pending_notifications()` SECURITY DEFINER SQL function: returns all (user, type, fire_date) whose local fire_time falls in the current 15-min UTC window; deduped via notifications_log; morning type additionally filtered to only users with at least one habit having no log for the prior effective date; sunday_review filtered to DOW=0; GRANT to service_role
- `public/manifest.json` + `public/sw.js`: push and notificationclick handlers; manifest link + theme-color meta added to index.html; SW registered in main.tsx
- `src/lib/pushSubscription.ts`: `subscribeToPush()` — requests permission, creates PushManager subscription, upserts to push_subscriptions; uses `VITE_VAPID_PUBLIC_KEY` env var
- `supabase/functions/notify-worker/index.ts`: Deno Edge Function; validates x-cron-secret; calls `find_pending_notifications()`; sends via `npm:web-push`; upserts notifications_log with ignoreDuplicates; deletes 410-Gone subscriptions
- `HabitsPage`: one-time "Enable notifications" banner after first habit (guards on Notification.permission + localStorage)
- `SettingsPage`: Notifications section — device subscribe button + evening/morning/sunday_review toggles backed by notification_preferences

**Next up:** step 8 — profile view + logging streak

---

## 2026-05-25 Session 2

**Bug fixes**

- `BlurbInput`: changed `px-4` → `pl-4 pr-10` on the input so text no longer runs under the character counter; counter shows `✓` on save (fits tight space)
- Email verification flow: new `VerifyEmailPage` (`/verify-email`) — shows "check your email" holding page; watches `session` via `AuthContext` and auto-navigates to `/` the moment confirmation fires; `SignupPage` now redirects here instead of directly to `/onboarding`; `/verify-email` added as a public route in `App.tsx`
- Supabase free tier has a low auth email rate limit (~3–4/hr). For dev: disable "Confirm email" in Supabase dashboard → Authentication → Sign In / Sign Up. Re-enable before prod and wire up a custom SMTP provider (Resend recommended) via Authentication → SMTP Settings.

**Feed timing — NOT YET IMPLEMENTED (live feed kept for testing)**

Agreed behaviour for prod:
- Feed always shows the **previous effective date** only — never today's in-progress logging
- Friends with **zero logs** on that date are completely absent (no card, no placeholder)
- Feed is a **static snapshot** fetched once on mount; no real-time subscription
- The backfill live-update window (4am–11am, matching the morning catch-up notification) is deferred until previous-day editing is built

Implementation when ready:
1. In `FeedPage`, replace the `last 7 days` date range with `previous_effective_date` (one day before `getEffectiveDate(userTimezone)`)
2. Filter out friends whose log/blurb join returns zero rows for that date
3. Remove any `.on('postgres_changes', ...)` real-time subscription if one is present (currently the feed is a plain fetch — confirm before removing)
4. The morning backfill live window can be added later: re-enable real-time only between 4am and 11am local time using the same `getEffectiveDate` helper to gate the subscription
