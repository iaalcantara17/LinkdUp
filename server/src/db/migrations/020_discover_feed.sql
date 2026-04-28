CREATE TABLE IF NOT EXISTS public.feed_posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    caption TEXT,
    venue_name TEXT NOT NULL,
    venue_address TEXT,
    venue_latitude DOUBLE PRECISION,
    venue_longitude DOUBLE PRECISION,
    venue_google_place_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS feed_posts_created_at_idx ON public.feed_posts (created_at DESC);
CREATE INDEX IF NOT EXISTS feed_posts_creator_id_idx ON public.feed_posts (creator_id);

ALTER TABLE public.feed_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "feed_posts_all_backend" ON public.feed_posts
    FOR ALL USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';

-- Seed 6 mock posts using the first real user in the table
DO $$
DECLARE
    seed_uid UUID;
BEGIN
    SELECT id INTO seed_uid FROM public.users ORDER BY created_at LIMIT 1;
    IF seed_uid IS NULL THEN
        RAISE NOTICE 'No users found — skipping feed seed';
        RETURN;
    END IF;

    INSERT INTO public.feed_posts (creator_id, image_url, caption, venue_name, venue_address, venue_latitude, venue_longitude, created_at)
    VALUES
        (seed_uid, 'https://picsum.photos/seed/maplerpool/800/1200',
         'Late night swims and great vibes. Perfect spot for a crew hangout #poolvibes #nightlife #summer',
         'Maple Pool Lounge', '123 Maple Ave, Newark, NJ 07102', 40.7357, -74.1724, NOW() - INTERVAL '1 hour'),
        (seed_uid, 'https://picsum.photos/seed/skyhighbar/800/1200',
         'The views up here are unreal. Catch the sunset with your whole crew #rooftop #cityviews #jerseycity',
         'Sky High Rooftop Bar', '456 High St, Jersey City, NJ 07302', 40.7178, -74.0431, NOW() - INTERVAL '3 hours'),
        (seed_uid, 'https://picsum.photos/seed/cozycafe/800/1200',
         'Found my new favorite study spot. The lattes here are incredible #cafe #cozy #studylife',
         'Cozy Corner Cafe', '789 Corner Rd, Montclair, NJ 07042', 40.8259, -74.2090, NOW() - INTERVAL '6 hours'),
        (seed_uid, 'https://picsum.photos/seed/strikebowl/800/1200',
         'Strike Zone is the move for group nights out. Lanes, food, and good music #bowling #groupfun #weekendvibes',
         'Strike Zone Bowling', '321 Lane Blvd, Bloomfield, NJ 07003', 40.8032, -74.1840, NOW() - INTERVAL '12 hours'),
        (seed_uid, 'https://picsum.photos/seed/sunsetpark/800/1200',
         'Nothing beats golden hour at the park. Bring snacks and good energy #sunsetpark #outdoors #goldenhour',
         'Sunset Park', '654 Park Dr, East Orange, NJ 07017', 40.7679, -74.2130, NOW() - INTERVAL '1 day'),
        (seed_uid, 'https://picsum.photos/seed/urbankitchen/800/1200',
         'The brunch spread here is next level. Amazing food, great ambiance #foodie #brunch #urbanlife',
         'The Urban Kitchen', '987 Urban Way, South Orange, NJ 07079', 40.7505, -74.2607, NOW() - INTERVAL '2 days')
    ON CONFLICT DO NOTHING;
END $$;
