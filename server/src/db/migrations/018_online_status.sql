ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ DEFAULT NOW();
NOTIFY pgrst, 'reload schema';
