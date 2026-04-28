ALTER TABLE public.users ADD COLUMN IF NOT EXISTS
    location_permission_status TEXT DEFAULT 'unset'
    CHECK (location_permission_status IN ('unset', 'granted', 'maybe_later'));

NOTIFY pgrst, 'reload schema';
