-- =============================================================================
-- 001_fix_fks.sql
-- Run this entire file in the Supabase SQL Editor (Dashboard → SQL Editor → New query).
-- Every statement is idempotent: safe to run multiple times.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Ensure public.users.id is backed by auth.users(id) with cascade delete.
--    This guarantees that deleting a user from Supabase Auth also removes
--    their public profile row.
-- ---------------------------------------------------------------------------
DO $$ BEGIN
    ALTER TABLE public.users
        ADD CONSTRAINT users_auth_fk
        FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Explicit FK: party_members.party_id → parties(id)
--    PostgREST uses pg_constraint to build its join graph.  If the table was
--    created without this FK (e.g. partial schema run), PostgREST cannot
--    resolve embedded selects like .select('parties(...)').
-- ---------------------------------------------------------------------------
DO $$ BEGIN
    ALTER TABLE public.party_members
        ADD CONSTRAINT party_members_party_fk
        FOREIGN KEY (party_id) REFERENCES public.parties(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Explicit FK: party_members.user_id → users(id)
--    Required for PostgREST to resolve .select('users(...)') from party_members.
-- ---------------------------------------------------------------------------
DO $$ BEGIN
    ALTER TABLE public.party_members
        ADD CONSTRAINT party_members_user_fk
        FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- 4. parties table – columns the API reads/writes that may be missing if an
--    older version of schema.sql was applied.
-- ---------------------------------------------------------------------------
ALTER TABLE public.parties
    ADD COLUMN IF NOT EXISTS updated_at          timestamptz NOT NULL DEFAULT now(),
    ADD COLUMN IF NOT EXISTS midpoint_lat        double precision,
    ADD COLUMN IF NOT EXISTS midpoint_lng        double precision,
    ADD COLUMN IF NOT EXISTS matched_location_id uuid,
    ADD COLUMN IF NOT EXISTS locked_date_id      uuid;

-- ---------------------------------------------------------------------------
-- 5. party_members table – columns the API reads/writes.
-- ---------------------------------------------------------------------------
ALTER TABLE public.party_members
    ADD COLUMN IF NOT EXISTS is_online boolean     NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS joined_at timestamptz NOT NULL DEFAULT now();

-- ---------------------------------------------------------------------------
-- 6. users table – Google Calendar token columns used by the calendar service.
-- ---------------------------------------------------------------------------
ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS google_calendar_token   text,
    ADD COLUMN IF NOT EXISTS google_calendar_refresh text,
    ADD COLUMN IF NOT EXISTS updated_at              timestamptz NOT NULL DEFAULT now();

-- ---------------------------------------------------------------------------
-- 7. party_status enum – add 'locked' if an older run created the type with
--    'done' as the terminal state instead.
-- ---------------------------------------------------------------------------
DO $$ BEGIN
    ALTER TYPE party_status ADD VALUE IF NOT EXISTS 'locked';
EXCEPTION WHEN others THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- 8. Deferred FKs: parties.matched_location_id and parties.locked_date_id.
--    These reference tables created after parties, so they must be added via
--    ALTER TABLE.
-- ---------------------------------------------------------------------------
DO $$ BEGIN
    ALTER TABLE public.parties
        ADD CONSTRAINT parties_matched_location_fk
        FOREIGN KEY (matched_location_id) REFERENCES public.locations(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE public.parties
        ADD CONSTRAINT parties_locked_date_fk
        FOREIGN KEY (locked_date_id) REFERENCES public.party_dates(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- 9. Flush PostgREST's schema cache.
--    This forces Supabase to re-read all FK relationships from pg_constraint
--    immediately, without waiting for the next automatic reload.
--    CRITICAL: run this last, after all FK changes above.
-- ---------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
