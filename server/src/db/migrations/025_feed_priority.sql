ALTER TABLE public.locations
    ADD COLUMN IF NOT EXISTS is_priority BOOLEAN NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';
