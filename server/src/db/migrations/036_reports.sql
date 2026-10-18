BEGIN;

CREATE TABLE IF NOT EXISTS public.reports (
    id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_id      uuid        REFERENCES public.users(id) ON DELETE SET NULL,
    reported_user_id uuid        REFERENCES public.users(id) ON DELETE SET NULL,
    reason           text        NOT NULL CHECK (reason IN ('spam', 'harassment', 'inappropriate', 'other')),
    details          text        CHECK (details IS NULL OR char_length(details) <= 500),
    created_at       timestamptz NOT NULL DEFAULT now(),
    CHECK (reporter_id <> reported_user_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS reports_one_per_day_idx
    ON public.reports (reporter_id, reported_user_id, ((created_at AT TIME ZONE 'UTC')::date));

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.reports FROM anon, authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';

SELECT relname, relrowsecurity
FROM pg_class
WHERE oid = 'public.reports'::regclass;
