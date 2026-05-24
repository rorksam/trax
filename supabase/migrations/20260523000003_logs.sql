-- Day boundary helper: day ends at 4am local time.
-- Called everywhere a "what day is it for this user" answer is needed.
CREATE OR REPLACE FUNCTION public.effective_date(tz text)
RETURNS date
LANGUAGE sql STABLE
AS $$
  SELECT (now() AT TIME ZONE tz - INTERVAL '4 hours')::date
$$;

CREATE TABLE public.logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  habit_id        uuid NOT NULL REFERENCES public.habits ON DELETE RESTRICT,
  logged_for_date date NOT NULL,
  logged_at       timestamptz NOT NULL DEFAULT now(),
  value           numeric,
  status          text NOT NULL CHECK (status IN ('skipped', 'partial', 'complete')),
  was_logged_late boolean NOT NULL DEFAULT false,
  UNIQUE (habit_id, logged_for_date)
);

ALTER TABLE public.logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "logs: crud own"
  ON public.logs FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.habits
       WHERE habits.id      = logs.habit_id
         AND habits.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.habits
       WHERE habits.id      = logs.habit_id
         AND habits.user_id = auth.uid()
    )
  );
