CREATE TABLE public.users (
  id                       uuid PRIMARY KEY REFERENCES auth.users ON DELETE RESTRICT,
  email                    text NOT NULL,
  display_name             text,
  timezone                 text,
  default_habit_visibility text NOT NULL DEFAULT 'detailed'
                             CHECK (default_habit_visibility IN ('detailed', 'aggregated', 'hidden')),
  logging_streak_count     int  NOT NULL DEFAULT 0,
  last_logged_date         date,
  created_at               timestamptz NOT NULL DEFAULT now(),
  deleted_at               timestamptz
);

-- Auto-insert a profile row whenever a user signs up via Supabase Auth.
-- SECURITY DEFINER + fixed search_path is required so the function can write
-- to public.users without the invoking user needing INSERT permission.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, email)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users: read own"
  ON public.users FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "users: update own"
  ON public.users FOR UPDATE
  USING  (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
