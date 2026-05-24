-- ============================================================
-- Step 5: Friendships + Invite Links
-- ============================================================

-- ── invites ──────────────────────────────────────────────────

CREATE TABLE public.invites (
  token      text        PRIMARY KEY,
  created_by uuid        NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invites: read own"
  ON public.invites FOR SELECT
  USING (auth.uid() = created_by);

CREATE POLICY "invites: insert own"
  ON public.invites FOR INSERT
  WITH CHECK (auth.uid() = created_by);

-- Used by the client to revoke (set revoked_at).
CREATE POLICY "invites: update own"
  ON public.invites FOR UPDATE
  USING  (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);

-- ── friendships ──────────────────────────────────────────────

CREATE TABLE public.friendships (
  user_a_id  uuid        NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  user_b_id  uuid        NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_a_id, user_b_id),
  CHECK (user_a_id < user_b_id)
);

ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "friendships: read own"
  ON public.friendships FOR SELECT
  USING (auth.uid() = user_a_id OR auth.uid() = user_b_id);

-- No INSERT policy — rows are written exclusively via accept_invite().

CREATE POLICY "friendships: delete own"
  ON public.friendships FOR DELETE
  USING (auth.uid() = user_a_id OR auth.uid() = user_b_id);

-- ── users: friends can read each other's profiles ────────────
-- Required so the friends list can resolve display names.
-- Adds a second SELECT policy; RLS ORs multiple policies together.

CREATE POLICY "users: friends can read"
  ON public.users FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.friendships
       WHERE (user_a_id = auth.uid() AND user_b_id = id)
          OR (user_b_id = auth.uid() AND user_a_id = id)
    )
  );

-- ── generate_invite() ─────────────────────────────────────────
-- Atomically revokes all active invites for the caller, generates
-- a fresh 24-char hex token with a 3-day expiry, and returns it.

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

  v_token := encode(gen_random_bytes(12), 'hex');

  INSERT INTO public.invites (token, created_by, expires_at)
  VALUES (v_token, auth.uid(), now() + INTERVAL '3 days');

  RETURN v_token;
END;
$$;

-- ── accept_invite(p_token) ────────────────────────────────────
-- Validates the token (exists / not revoked / not expired / not
-- self-invite) and inserts a friendship row with the smaller UUID
-- first. ON CONFLICT DO NOTHING makes double-acceptance a no-op.
-- Returns { ok: true } or { error: '<reason>' }.

CREATE OR REPLACE FUNCTION public.accept_invite(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_invite public.invites%ROWTYPE;
  v_caller uuid := auth.uid();
  v_a      uuid;
  v_b      uuid;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('error', 'not_authenticated');
  END IF;

  SELECT * INTO v_invite
    FROM public.invites
   WHERE token = p_token;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'not_found');
  END IF;

  IF v_invite.revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'revoked');
  END IF;

  IF v_invite.expires_at < now() THEN
    RETURN jsonb_build_object('error', 'expired');
  END IF;

  IF v_invite.created_by = v_caller THEN
    RETURN jsonb_build_object('error', 'self_invite');
  END IF;

  IF v_invite.created_by < v_caller THEN
    v_a := v_invite.created_by;
    v_b := v_caller;
  ELSE
    v_a := v_caller;
    v_b := v_invite.created_by;
  END IF;

  INSERT INTO public.friendships (user_a_id, user_b_id)
  VALUES (v_a, v_b)
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object('ok', true);
END;
$$;
