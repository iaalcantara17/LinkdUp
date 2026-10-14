ALTER TABLE public.users ADD COLUMN IF NOT EXISTS
    theme_preference TEXT NOT NULL DEFAULT 'dark'
    CHECK (theme_preference IN ('dark', 'light', 'system'));

NOTIFY pgrst, 'reload schema';

SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'users'
  AND column_name = 'theme_preference';
