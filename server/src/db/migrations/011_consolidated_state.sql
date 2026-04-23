-- 011_consolidated_state.sql
-- Idempotent catch-up migration — safe to run even if all earlier migrations
-- already applied. Uses IF NOT EXISTS / IF EXISTS everywhere.
--
-- Run this in the Supabase SQL Editor if any of the following bugs appear:
--   • PATCH /api/user/me returns 200 but pronouns/birthday/bio don't persist
--     → means migration 010 never ran (missing columns on public.users)
--   • /more-venues always re-fetches page 1 (no pagination variety)
--     → means migration 007 never ran (missing next_page_token on parties)
--   • Load-more doesn't rotate category buckets
--     → means migration 009 never ran (missing venue_rotation_seed on parties)
--   • Discover likes fail with "relation does not exist"
--     → means migration 008 never ran (missing discover_likes table)

-- ── Migration 007: next_page_token ───────────────────────────────────────────
-- Persists the Google Places Legacy API pagination cursor across server restarts.
ALTER TABLE public.parties ADD COLUMN IF NOT EXISTS next_page_token TEXT;

-- ── Migration 008: discover_likes ────────────────────────────────────────────
-- Personal liked venues from the Discover screen (not party/voting related).
CREATE TABLE IF NOT EXISTS public.discover_likes (
    id              UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID             NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    google_place_id TEXT             NOT NULL,
    name            TEXT             NOT NULL,
    address         TEXT,
    latitude        DOUBLE PRECISION,
    longitude       DOUBLE PRECISION,
    photo_url       TEXT,
    rating          NUMERIC,
    category        TEXT,
    price_level     INT,
    liked_at        TIMESTAMPTZ      DEFAULT NOW(),
    UNIQUE(user_id, google_place_id)
);

-- Enable RLS (idempotent — no-op if already enabled)
ALTER TABLE public.discover_likes ENABLE ROW LEVEL SECURITY;

-- Backend policy (idempotent via DO block)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename  = 'discover_likes'
          AND policyname = 'discover_likes_all_backend'
    ) THEN
        CREATE POLICY "discover_likes_all_backend" ON public.discover_likes
            FOR ALL USING (true) WITH CHECK (true);
    END IF;
END
$$;

-- ── Migration 009: venue_rotation_seed ───────────────────────────────────────
-- Tracks which category bucket the next load-more call should use.
ALTER TABLE public.parties ADD COLUMN IF NOT EXISTS venue_rotation_seed INT DEFAULT 0;

-- ── Migration 010: user profile fields ───────────────────────────────────────
-- Adds pronouns, birthday, and bio to the users table.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS pronouns TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS birthday DATE;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS bio     TEXT;

-- Reload PostgREST schema cache so newly added columns are immediately visible.
NOTIFY pgrst, 'reload schema';
