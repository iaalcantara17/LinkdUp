CREATE TABLE IF NOT EXISTS public.bookmark_collections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 50),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bookmark_collections_user_id_idx ON public.bookmark_collections (user_id, created_at DESC);

ALTER TABLE public.feed_bookmarks
    ADD COLUMN IF NOT EXISTS collection_id UUID REFERENCES public.bookmark_collections(id) ON DELETE SET NULL;

ALTER TABLE public.bookmark_collections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bookmark_collections_all_backend" ON public.bookmark_collections FOR ALL USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
