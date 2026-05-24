-- ============================================================
-- Step 6: Feed — blurbs table + cross-friend RLS policies
-- ============================================================

-- ── blurbs ───────────────────────────────────────────────────

CREATE TABLE public.blurbs (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  for_date   date        NOT NULL,
  text       text        NOT NULL CHECK (char_length(text) <= 140),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, for_date)
);

ALTER TABLE public.blurbs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "blurbs: crud own"
  ON public.blurbs FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "blurbs: friends can read"
  ON public.blurbs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.friendships
       WHERE (user_a_id = auth.uid() AND user_b_id = user_id)
          OR (user_b_id = auth.uid() AND user_a_id = user_id)
    )
  );

-- ── habits: friends can read visible habits ───────────────────
-- Non-hidden, non-archived habits are readable by friends.
-- Hidden habits are never sent to the client.

CREATE POLICY "habits: friends can read visible"
  ON public.habits FOR SELECT
  USING (
    habits.visibility != 'hidden'
    AND habits.archived_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.friendships
       WHERE (user_a_id = auth.uid() AND user_b_id = habits.user_id)
          OR (user_b_id = auth.uid() AND user_a_id = habits.user_id)
    )
  );

-- ── logs: friends can read logs for visible habits ────────────
-- A friend can read a log only if the habit it belongs to is
-- non-hidden. The join through habits enforces this; hidden
-- habits are excluded by the habits policy above, so even if
-- someone crafts a direct query against logs they cannot see
-- the habit row needed to satisfy this EXISTS check.

CREATE POLICY "logs: friends can read visible"
  ON public.logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1
        FROM public.habits
        JOIN public.friendships ON (
          (friendships.user_a_id = auth.uid() AND friendships.user_b_id = habits.user_id)
          OR (friendships.user_b_id = auth.uid() AND friendships.user_a_id = habits.user_id)
        )
       WHERE habits.id             = logs.habit_id
         AND habits.visibility    != 'hidden'
         AND habits.archived_at   IS NULL
    )
  );
