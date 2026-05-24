CREATE TABLE public.habits (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES public.users ON DELETE RESTRICT,
  name             text NOT NULL,
  category         text NOT NULL
                     CHECK (category IN ('Health','Fitness','Mental','Productivity','Learning','Social','Finance','Other')),
  type             text NOT NULL
                     CHECK (type IN ('binary','quantity','avoid')),
  target_value     numeric,
  target_direction text CHECK (target_direction IN ('at_least','at_most','range')),
  target_min       numeric,
  target_max       numeric,
  visibility       text NOT NULL DEFAULT 'detailed'
                     CHECK (visibility IN ('detailed','aggregated','hidden')),
  sort_order       int  NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  archived_at      timestamptz
);

ALTER TABLE public.habits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "habits: crud own"
  ON public.habits FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
