CREATE OR REPLACE FUNCTION public.generate_invite()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_token text;
BEGIN
  UPDATE public.invites
     SET revoked_at = now()
   WHERE created_by = auth.uid()
     AND revoked_at IS NULL;

  v_token := replace(gen_random_uuid()::text, '-', '');

  INSERT INTO public.invites (token, created_by, expires_at)
  VALUES (v_token, auth.uid(), now() + INTERVAL '3 days');

  RETURN v_token;
END;
$$;
