-- fix_schema.sql
-- Run this in the Supabase SQL Editor if your database was created before
-- the current schema.sql was finalised.  Every statement is idempotent.

-- =========================================================================
-- 1. users table – Google Calendar token columns
--    schema.sql names them google_calendar_token / google_calendar_refresh.
--    If your live DB has different names (e.g. google_refresh_token from an
--    earlier scaffold) the queries below will add the correct columns; you
--    can then copy data across and drop the old ones.
-- =========================================================================
ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS google_calendar_token   text,
    ADD COLUMN IF NOT EXISTS google_calendar_refresh text;

-- =========================================================================
-- 2. parties table – updated_at and midpoint columns
--    These are needed by POST /api/party/:id/start and GET /me/parties.
-- =========================================================================
ALTER TABLE public.parties
    ADD COLUMN IF NOT EXISTS updated_at    timestamptz NOT NULL DEFAULT now(),
    ADD COLUMN IF NOT EXISTS midpoint_lat  double precision,
    ADD COLUMN IF NOT EXISTS midpoint_lng  double precision,
    ADD COLUMN IF NOT EXISTS matched_location_id uuid,
    ADD COLUMN IF NOT EXISTS locked_date_id      uuid;

-- =========================================================================
-- 3. party_members – is_online column
-- =========================================================================
ALTER TABLE public.party_members
    ADD COLUMN IF NOT EXISTS is_online boolean NOT NULL DEFAULT false;

-- =========================================================================
-- 4. Deferred foreign keys (safe to re-run; will error only if the FK name
--    already exists – that is fine, it means the FK is already in place).
-- =========================================================================

-- parties.matched_location_id → locations.id
DO $$ BEGIN
    ALTER TABLE public.parties
        ADD CONSTRAINT parties_matched_location_fk
        FOREIGN KEY (matched_location_id) REFERENCES public.locations(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- parties.locked_date_id → party_dates.id
DO $$ BEGIN
    ALTER TABLE public.parties
        ADD CONSTRAINT parties_locked_date_fk
        FOREIGN KEY (locked_date_id) REFERENCES public.party_dates(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =========================================================================
-- 5. Reload the PostgREST schema cache so embedded-select joins resolve.
--    (Supabase reloads automatically on schema changes, but this forces it.)
-- =========================================================================
NOTIFY pgrst, 'reload schema';
