-- 013_friends.sql
-- Social graph: friend requests and accepted friendships between users.

CREATE TABLE IF NOT EXISTS public.friendships (
    id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    requester_id  UUID          NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    addressee_id  UUID          NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    status        TEXT          NOT NULL CHECK (status IN ('pending', 'accepted', 'blocked')),
    requested_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    responded_at  TIMESTAMPTZ,
    UNIQUE (requester_id, addressee_id),
    CHECK (requester_id != addressee_id)
);

CREATE INDEX IF NOT EXISTS friendships_requester_idx ON public.friendships (requester_id);
CREATE INDEX IF NOT EXISTS friendships_addressee_idx ON public.friendships (addressee_id);
CREATE INDEX IF NOT EXISTS friendships_status_idx    ON public.friendships (status);

ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename  = 'friendships'
          AND policyname = 'friendships_all_backend'
    ) THEN
        CREATE POLICY "friendships_all_backend" ON public.friendships
            FOR ALL USING (true) WITH CHECK (true);
    END IF;
END
$$;

NOTIFY pgrst, 'reload schema';
