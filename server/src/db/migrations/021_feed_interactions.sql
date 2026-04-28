CREATE TABLE IF NOT EXISTS public.feed_likes (
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    post_id UUID NOT NULL REFERENCES public.feed_posts(id) ON DELETE CASCADE,
    liked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, post_id)
);
CREATE INDEX IF NOT EXISTS feed_likes_post_id_idx ON public.feed_likes (post_id);

CREATE TABLE IF NOT EXISTS public.feed_bookmarks (
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    post_id UUID NOT NULL REFERENCES public.feed_posts(id) ON DELETE CASCADE,
    bookmarked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, post_id)
);

CREATE TABLE IF NOT EXISTS public.feed_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID NOT NULL REFERENCES public.feed_posts(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 500),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS feed_comments_post_id_idx ON public.feed_comments (post_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.user_follows (
    follower_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    followed_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    followed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (follower_id, followed_id),
    CHECK (follower_id != followed_id)
);

ALTER TABLE public.feed_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feed_bookmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feed_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_follows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "feed_likes_all_backend" ON public.feed_likes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "feed_bookmarks_all_backend" ON public.feed_bookmarks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "feed_comments_all_backend" ON public.feed_comments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "user_follows_all_backend" ON public.user_follows FOR ALL USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
