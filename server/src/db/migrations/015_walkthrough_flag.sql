ALTER TABLE public.users ADD COLUMN IF NOT EXISTS has_seen_walkthrough BOOLEAN DEFAULT FALSE;

NOTIFY pgrst, 'reload schema';
