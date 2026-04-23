-- 008_discover_likes.sql
-- Personal "liked venues" saved from the Discover screen.
-- Completely independent of the party/voting flow.

CREATE TABLE IF NOT EXISTS public.discover_likes (
    id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID          NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    google_place_id TEXT          NOT NULL,
    name            TEXT          NOT NULL,
    address         TEXT,
    latitude        DOUBLE PRECISION,
    longitude       DOUBLE PRECISION,
    photo_url       TEXT,
    rating          NUMERIC,
    category        TEXT,
    price_level     INT,
    liked_at        TIMESTAMPTZ   DEFAULT NOW(),
    UNIQUE(user_id, google_place_id)
);

ALTER TABLE public.discover_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "discover_likes_all_backend" ON public.discover_likes
    FOR ALL USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
