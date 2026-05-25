-- ============================================================
-- Step 7: Notifications
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE TYPE public.notification_type AS ENUM ('evening', 'morning', 'sunday_review');

-- ── notification_preferences ──────────────────────────────────

CREATE TABLE public.notification_preferences (
  user_id   uuid                      NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  type      public.notification_type  NOT NULL,
  enabled   boolean                   NOT NULL DEFAULT true,
  fire_time time                      NOT NULL,
  PRIMARY KEY (user_id, type)
);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notification_preferences: read own"
  ON public.notification_preferences FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "notification_preferences: update own"
  ON public.notification_preferences FOR UPDATE
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── push_subscriptions ────────────────────────────────────────

CREATE TABLE public.push_subscriptions (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  endpoint     text        NOT NULL UNIQUE,
  p256dh_key   text        NOT NULL,
  auth_key     text        NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "push_subscriptions: read own"
  ON public.push_subscriptions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "push_subscriptions: insert own"
  ON public.push_subscriptions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "push_subscriptions: update own"
  ON public.push_subscriptions FOR UPDATE
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "push_subscriptions: delete own"
  ON public.push_subscriptions FOR DELETE
  USING (auth.uid() = user_id);

-- ── notifications_log ─────────────────────────────────────────

CREATE TABLE public.notifications_log (
  user_id           uuid                     NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  notification_type public.notification_type NOT NULL,
  fire_date         date                     NOT NULL,
  sent_at           timestamptz              NOT NULL DEFAULT now(),
  UNIQUE (user_id, notification_type, fire_date)
);

ALTER TABLE public.notifications_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications_log: read own"
  ON public.notifications_log FOR SELECT
  USING (auth.uid() = user_id);

-- ── trigger: seed defaults for every new user ─────────────────

CREATE OR REPLACE FUNCTION public.seed_notification_preferences()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notification_preferences (user_id, type, enabled, fire_time) VALUES
    (NEW.id, 'evening',       true,  '21:00:00'),
    (NEW.id, 'morning',       true,  '11:00:00'),
    (NEW.id, 'sunday_review', false, '20:00:00');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_user_created_seed_notif_prefs
  AFTER INSERT ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.seed_notification_preferences();

-- Seed existing users (idempotent)
INSERT INTO public.notification_preferences (user_id, type, enabled, fire_time)
SELECT u.id, t.type, t.enabled, t.fire_time
FROM public.users u
CROSS JOIN (VALUES
  ('evening'::public.notification_type,       true,  '21:00:00'::time),
  ('morning'::public.notification_type,       true,  '11:00:00'::time),
  ('sunday_review'::public.notification_type, false, '20:00:00'::time)
) AS t(type, enabled, fire_time)
WHERE u.deleted_at IS NULL
ON CONFLICT DO NOTHING;

-- ── find_pending_notifications() ─────────────────────────────
-- Returns every (user, notification_type) whose fire_time falls
-- within the current 15-minute UTC window, deduped via notifications_log.
-- For morning: only fires when the user has at least one habit with
-- no log entry for the previous effective date.

CREATE OR REPLACE FUNCTION public.find_pending_notifications()
RETURNS TABLE(
  user_id           uuid,
  notification_type public.notification_type,
  fire_date         date,
  timezone          text
)
LANGUAGE sql
STABLE
SECURITY DEFINER SET search_path = public
AS $$
  WITH candidates AS (
    SELECT
      np.user_id,
      np.type                                               AS notification_type,
      u.timezone,
      (now() AT TIME ZONE u.timezone)::date                AS fire_date,
      (now() AT TIME ZONE u.timezone)::time                AS local_time,
      EXTRACT(DOW FROM now() AT TIME ZONE u.timezone)::int AS dow,
      np.fire_time
    FROM public.notification_preferences np
    JOIN public.users u ON u.id = np.user_id
    WHERE u.deleted_at IS NULL
      AND np.enabled = true
  ),
  windowed AS (
    SELECT c.*
    FROM candidates c
    WHERE c.local_time >= c.fire_time
      AND c.local_time <  c.fire_time + INTERVAL '15 minutes'
      AND (c.notification_type != 'sunday_review' OR c.dow = 0)
      AND NOT EXISTS (
        SELECT 1 FROM public.notifications_log nl
        WHERE nl.user_id           = c.user_id
          AND nl.notification_type = c.notification_type
          AND nl.fire_date         = c.fire_date
      )
  )
  SELECT w.user_id, w.notification_type, w.fire_date, w.timezone
  FROM windowed w
  WHERE w.notification_type != 'morning'
     OR EXISTS (
          SELECT 1
          FROM public.habits h
          WHERE h.user_id     = w.user_id
            AND h.archived_at IS NULL
            AND NOT EXISTS (
              SELECT 1 FROM public.logs l
              WHERE l.habit_id        = h.id
                AND l.logged_for_date = w.fire_date - INTERVAL '1 day'
            )
        )
$$;

GRANT EXECUTE ON FUNCTION public.find_pending_notifications() TO service_role;
