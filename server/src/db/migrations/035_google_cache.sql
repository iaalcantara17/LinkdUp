BEGIN;

CREATE TABLE IF NOT EXISTS public.google_cache (
    kind       text        NOT NULL CHECK (kind IN ('nearby', 'geocode', 'photo')),
    key        text        NOT NULL CHECK (char_length(key) BETWEEN 1 AND 512),
    payload    jsonb       NOT NULL CHECK (pg_column_size(payload) <= 65536),
    fetched_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (kind, key)
);

ALTER TABLE public.google_cache ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.google_cache FROM anon, authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';

SELECT relname, relrowsecurity
FROM pg_class
WHERE oid = 'public.google_cache'::regclass;
