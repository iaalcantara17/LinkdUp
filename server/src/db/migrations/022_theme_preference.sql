ALTER TABLE public.users ADD COLUMN IF NOT EXISTS
    theme_preference TEXT DEFAULT 'dark'
    CHECK (theme_preference IN ('dark', 'light', 'system'));

NOTIFY pgrst, 'reload schema';
