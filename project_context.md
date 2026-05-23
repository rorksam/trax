# Habit Tracker — Project Context

## Project Goals

A habit tracker focused on **social accountability**. Users define habits they want to keep, stop, or measure (quantity-based), log their progress daily, and a small circle of trusted friends can see what they accomplished — with strong, granular privacy controls.

The accountability-via-peer-visibility angle is the differentiator. To-do lists and habit trackers are saturated; the social layer with privacy gradients is the actual product and is built in from day one.

**Initial scope:** proof-of-concept for use by a small friend group this summer. Optimize for: free-tier hosting, minimal services, fastest path to real usage. Resist over-engineering.

**Non-goals for v1:** streaks-as-gamification (only a logging streak), badges, public profiles, discovery, ranking friends by completion, social feed of user actions (archives, edits), competitive features. This is not a social network — it is an accountability tool.

---

## Stack

- **Frontend:** React + Vite, Tailwind CSS, configured as a PWA (manifest + service worker).
- **Backend:** Supabase (Postgres, Auth, Edge Functions, pg_cron, Row-Level Security).
- **Hosting:** Vercel or Cloudflare Pages free tier.
- **Push notifications:** Web Push API with VAPID keys, sent via the `web-push` npm library from a Supabase Edge Function.
- **Key libraries:** `react-swipeable` (gestures), `date-fns-tz` (timezone math).

**Why PWA, not native iOS:** budget. Native iOS requires a $99/year Apple Developer account, Xcode, TestFlight, and Swift or React Native expertise. PWAs support push notifications on Android natively and on iOS 16.4+ once installed to the home screen. The iOS install flow is the main UX hazard — see Notifications section.

---

## Data Model

```
users
  id, email, display_name, timezone,
  default_habit_visibility (detailed | aggregated | hidden),
  logging_streak_count, last_logged_date,
  created_at, deleted_at  -- deleted_at used for anonymization, not hard delete

habits
  id, user_id, name, category,
  type (binary | quantity | avoid),
  target_value, target_direction (at_least | at_most | range),
  target_min, target_max,
  visibility (detailed | aggregated | hidden),
  sort_order,
  created_at, archived_at  -- archived_at NULL means active

logs
  id, habit_id, logged_for_date, logged_at,
  value (numeric, nullable for binary habits),
  status (none | skipped | partial | complete),
  was_logged_late (boolean)

blurbs
  id, user_id, for_date, text, created_at, updated_at
  UNIQUE(user_id, for_date)  -- one blurb per user per day, not per habit

friendships
  user_a_id, user_b_id, created_at
  -- enforce user_a_id < user_b_id at insert time to dedupe

invites
  token (random 16+ chars, opaque),
  created_by, expires_at, revoked_at
  -- 3-day expiration, reusable, manual revoke + regenerate button

notification_preferences
  user_id, type (evening | morning | sunday_review),
  enabled, fire_time (TIME)
  -- timezone comes from users table, not duplicated

push_subscriptions
  id, user_id, endpoint, p256dh_key, auth_key,
  created_at, last_seen_at
  -- one user may have multiple devices; send to all

notifications_log
  user_id, notification_type, fire_date, sent_at
  UNIQUE(user_id, notification_type, fire_date)
  -- prevents double-sending on retry/restart
```

**FK rules:** All foreign keys referencing `users` must use `ON DELETE SET NULL` or `ON DELETE RESTRICT`. **Never `ON DELETE CASCADE`.** Account deletion is implemented via anonymization (null display_name and email, preserve logs and friendships so friends' historical feeds don't break).

**Row-Level Security:** RLS policies are required on every table. Write them as each table is built, not at the end. Without RLS, anyone with an API key can read all habit logs.

---

## Categories (Curated)

Habit categories are a fixed list. Habit names within them are free text.

`Health`, `Fitness`, `Mental`, `Productivity`, `Learning`, `Social`, `Finance`, `Other`

Fitness is separate from Health intentionally — users think about workouts vs. medication differently. Mental is separate from Health for the same reason.

---

## Habit Types

Three types:

1. **Binary** — did/didn't (e.g., "Go for a run"). Status is one of `none`, `skipped`, `complete`.
2. **Quantity** — numeric value against a target (e.g., "Drink 64oz water"). Has a `target_direction`:
   - `at_least` — hit-or-exceed (water, protein)
   - `at_most` — stay-under (calories, screen time)
   - `range` — between min and max (e.g., calories 1800–2200)
   Status is computed: `none` (no log), `partial` (logged but didn't hit target), `complete` (hit target).
3. **Avoid** — didn't-do-it (e.g., "Didn't smoke"). Binary semantically, treated as `complete` when user affirms abstention.

For binary habits, the three-state model is critical:

- `none` — user has not touched the habit today.
- `skipped` — user explicitly marked "no, not doing this today." Counts as engagement.
- `complete` — user did it.

The morning catch-up notification (see Notifications) fires **only on `none`**, not on `skipped`. This avoids nagging users who genuinely couldn't do the habit and already acknowledged it.

For the friend feed, `skipped` and `none` render identically as "did not complete." The distinction is internal to the reminder logic.

For quantity habits, the equivalent rule: logging any value (including zero) counts as engagement. Only zero-log habits trigger the morning catch-up.

---

## Day Boundary Logic

- The "day" ends at **4am local time** in the user's timezone.
- `effective_date(now) = (now_in_user_tz - 4 hours).date()`
- Implement this as a single server-side helper. Call it from every place that needs "what day is it for this user right now." **Never trust client clocks** for anything that affects data correctness.
- User's timezone is stored on the `users` table and captured at signup.

**Backfill grace window:** users can edit logs for the previous day until **noon the following day** in their local time. After that, logs are locked.

**Logged-late marking:** any log written after the 4am cutoff for its `logged_for_date` is marked `was_logged_late = true`. These logs are visible to friends with a "logged late" indicator and float to the top of the feed.

---

## Habit Lifecycle

**Create:** appears in today's logging immediately. No "missed" status for the day of creation; user can engage with it or ignore it.

**Edit — cosmetic (name, category, visibility, sort_order):** edit in place on the existing row. History unaffected.

**Edit — substantive (target_value, target_direction, type):** archive the old habit row, create a new one with the same name/category/visibility/sort_order. From the user's perspective there is still one habit in their list. Historical logs stay attached to the old habit row with the old target. New logs go to the new row. **Edits are never retroactive.**

**Archive:** sets `archived_at`. Habit disappears from daily logging but historical logs remain visible in feeds, profiles, and reviews. Reversible.

**Delete:** allowed only if the habit has zero logs. If logs exist, the only option is archive. This rule prevents data loss and ethical/legal issues.

**Sort:** drag-to-reorder updates `sort_order`. Default order is creation order.

**No social broadcasting of habit changes.** Friends never see "Alex archived a habit" or "Alex created a new habit." The feed shows logs only.

---

## Privacy & Visibility

Per-habit `visibility` field with three values:

- `detailed` — friends see the habit name and its completion status.
- `aggregated` — friends see only the category-level roll-up; this habit contributes to the category's dot count but its name is not shown.
- `hidden` — friends see nothing. The habit does not appear in any form on friends' views. If a user's entire category is hidden, the category itself does not render for friends. There is no "this user has hidden habits" indicator.

Users set a `default_habit_visibility` on their profile (used when creating new habits) and can override per habit.

The `hidden` option matters. The app will inevitably be used for sensitive things (recovery, mental health, medication adherence). A habit being fully invisible — not even revealing its existence — is a trust requirement, not a feature.

---

## Daily Logging UX

**Swipe gestures (mobile, following Gmail/Tinder precedent):**

- Swipe right → mark complete.
- Swipe left → mark skipped.
- Swipe same direction again → undo (back to `none`).
- Swipe opposite direction → swap (e.g., complete becomes skipped).
- Color tint indicates current state: green for complete, red/gray for skipped, neutral for none.

**Accessibility / desktop fallback:** tap to expand the habit row, showing explicit Complete / Skip buttons. Always provide the non-swipe path. Swipe detection should require minimum horizontal distance and reject swipes with significant vertical movement (to avoid conflicting with scroll). Use `react-swipeable`; don't roll your own gesture detection.

**Quantity habits:** number input with target and direction visible. Status (none/partial/complete) computed from the entered value.

---

## Friend System & Invites

**Invite links:** reusable, **3-day expiration**, opaque random tokens, format `app.com/invite/{token}`. Stored in `invites` table with `created_by`, `expires_at`, `revoked_at`. Provide UI to revoke and regenerate.

**Acceptance flow:** clicking the link → sign up / sign in if needed → friendship is auto-created on landing. No separate "confirm" step.

**Friendships are symmetric on acceptance.** The link creator opted in by generating it; the acceptor opts in by using it.

**Storage:** to dedupe and simplify queries, always store `friendships` with `user_a_id < user_b_id`. Enforce this at insert.

**Friend discovery:** invite links only. No email lookup, no public profiles, no discovery.

---

## Feed

**Concept:** one card per friend per day. Each user has at most one card visible to friends, representing their most-recent-completed-day relative to **their own 4am cutoff** (not the viewer's). A user in PST who hasn't hit 4am yet still shows their day-before-yesterday to an EST friend who already has.

**Implementation:** the feed is a **live query, not a stored artifact.** No "generate feed at 4am" job. Loading the feed computes, for each friend, "what is this friend's most recently completed `effective_date`?" and renders a card from logs on that date. The 4am boundary is purely a logical line in the query.

**Mutability:** a card can update during the friend's noon grace window if they backfill. After noon, the card is effectively frozen until the next day rolls over.

**Card content:**

- Optional one-line blurb (≤140 chars), per-day not per-habit.
- Category sections with color-tinted headings:
  - Green = all habits in this category complete
  - Amber = partial completion
  - Gray = nothing complete
  - **Never red.** This app does not punish missing days.
- Each habit in the category rendered according to its visibility:
  - `detailed`: habit name + status dot (● ◐ ○).
  - `aggregated`: contributes anonymously to category dot count, name not shown.
  - `hidden`: completely omitted.
- Categories with zero non-hidden habits do not render at all for that viewer.

**Empty cards:** if a friend has no logs for the period, their card does **not** appear in the feed. Empty cards are demoralizing. Profile view (separate) will surface "no logs for N days" if a friend wants to check in.

**Ordering:**

1. Logged-late cards at the top, most recent edit first.
2. Then cards by `logged_at` finalization timestamp.
3. Tiebreaker: alphabetical by display name.

**Never rank by completion percentage.** This is not a competition.

**Colorblind accessibility:** dot fills (●●○) carry the same information as color tints. Information must never be color-only.

---

## Profile View

Per-friend profile shows:

- Past days of logs (visible per visibility rules).
- **Logging streak** (consecutive days with at least one log), not completion streak. Rewards showing up, not perfection.
- "No logs for N days" callout if applicable, worded informationally, not accusatorially ("No logs for 3 days," not "Alex hasn't logged in 3 days 😟").

---

## Week-in-Review

Personal, **not social.** A Sunday evening digest screen showing the past week at a glance:

- Per-habit summary: e.g., "Drink water: 5/7 days complete."
- Mid-week edits show the **new target only.** Users know what they changed; this is "your week at a glance" not "exactly what happened."
- New habits added mid-week show their stats from creation forward: e.g., "Added 'call parents' on Wednesday, completed 3/5 days since."

**Defer if running short on summer.** It's nice-to-have, not core.

---

## Notifications

**Channel:** Web Push only for v1. No email. (Email fallback as secondary channel can be added later if web-push adoption is poor in practice.)

**Three notification types, all to the user about their own logging:**

1. **Evening reminder** — "Log your habits for today." Fires at user-configured time, default **9pm local**. Always fires if user has any active habits.
2. **Morning catch-up** — "You missed some habits yesterday." Fires at **11am local**, **only if** any of yesterday's habits are still in `none` state. `skipped` and `complete` are both considered engaged and do not trigger this.
3. **Sunday week-in-review** — fires Sunday evening, links to the review screen. Optional, off by default. Cut from v1 if needed.

**No social notifications.** Never push "Alex completed all their habits!" or "Brittany added a friend." The feed is a pull surface.

**Scheduling — the 15-minute worker:**

Per-user local-time scheduling can't use straight cron. Pattern:

- A Supabase Edge Function runs every 15 minutes via pg_cron.
- Each run, query: "find every enabled notification_preference whose next fire time (in the user's TZ) falls within the next 15 minutes."
- For each match, check `notifications_log` for the dedup key `(user_id, notification_type, fire_date_in_user_tz)`. If not present, send the push and insert the log row.

**Why 15 minutes:** accurate within 15 min (acceptable), 96 runs/day (well within free tier), simple to reason about.

**The dedup table is essential.** Without it, retries or worker restarts will double-notify.

**Push subscription handling:**

- VAPID keys generated once, stored in env vars.
- Service worker handles incoming push events when app is closed.
- On permission grant, store the subscription in `push_subscriptions`. A user may have multiple devices; send to all.
- When a push send returns 410 Gone, delete that subscription row.

**Permission ask timing:** after the user creates their first habit. Not at signup (no context), not on a dedicated screen later (extra session before notifications start). Mid-flow ask once they've invested something.

**iOS PWA install — the single biggest UX hazard:**

- iOS Safari supports Web Push only after the user adds the PWA to their home screen.
- The install flow is multi-step (share button → scroll → "Add to Home Screen" → confirm) and users will not figure it out without explicit guidance.
- Onboarding must:
  1. Detect iOS + non-standalone mode.
  2. Show a dedicated explainer with screenshots or short video of the exact taps.
  3. After install, detect standalone mode on next launch and prompt for notification permission.
  4. If the user refuses install, let them through but flag that notifications won't work.
- **Before inviting friends, test the full iOS install + push flow on a real iPhone.** Not the simulator. Build a minimal hello-world PWA-push project first if you've never done it.

---

## Build Order

1. **Auth, user setup, timezone capture.** Foundation. Default visibility setting lives here.
2. **Habit CRUD + categories.** Create, list, edit, archive, delete (if no logs), drag-sort. No social yet.
3. **Daily logging view + swipe gestures.** Core daily interaction. Get this feeling right before anything else.
4. **Day boundary logic + backfill grace window.** Don't defer — every later feature depends on `effective_date` being correct.
5. **Friendships + invite links.** Data model and acceptance flow. No feed yet.
6. **Feed.** Live-query rendering, category aggregation, late markers, color tints.
7. **Push notifications + the 15-minute worker.** Last because it's the most environment-sensitive piece; everything else should work first.
8. **Profile view + logging streak.**
9. **Week-in-review.** Cut if summer runs short.

Build steps 1–4 fully before showing anyone, including friends. A broken daily logging experience kills the app before social features get a chance to matter.

---

## Implementation Discipline

- **Single server-side helper for `effective_date(user_id) → date`.** Inconsistency between client and server on day boundaries is the single most likely source of bugs. Call this helper everywhere.
- **RLS policies written as each table is built**, never deferred.
- **No admin UI for v1.** Use Supabase SQL console for data fixes. Admin tools are a tar pit.
- **No streaks-as-gamification beyond the logging streak.** No badges, levels, points.
- **No ranking, no leaderboards, no friend-action notifications.** Ever.

---

## Things Cut From v1

These were considered and intentionally deferred:

- Per-friend visibility (each friend sees a different level). Schema supports adding it later.
- Email reminders as a secondary channel.
- User-configurable notification times. Hardcode 9pm and 11am for v1.
- Per-device subscription management UI. Just send to all subscriptions.
- Sunday week-in-review push notification (the screen itself may still ship).
- Habit templates, suggestions, public discovery, badges, gamification.
