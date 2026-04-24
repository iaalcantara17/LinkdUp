CREATE TABLE IF NOT EXISTS public.user_screen_hints (
    user_id   UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    screen_key TEXT NOT NULL,
    seen_at   TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, screen_key)
);

ALTER TABLE public.user_screen_hints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_screen_hints_all_backend" ON public.user_screen_hints
    FOR ALL USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
