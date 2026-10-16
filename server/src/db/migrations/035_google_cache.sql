BEGIN;

CREATE TABLE IF NOT EXISTS public.google_cache (
    kind       text        NOT NULL CHECK (kind IN ('nearby', 'geocode')),
    key        text        NOT NULL CHECK (char_length(key) BETWEEN 1 AND 512),
    payload    jsonb       NOT NULL CHECK (pg_column_size(payload) <= 8192),
    fetched_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (kind, key),
    CONSTRAINT google_cache_payload_shape CHECK (COALESCE(
        (kind = 'nearby'
            AND jsonb_typeof(payload) = 'object'
            AND jsonb_typeof(payload -> 'ids') = 'array'
            AND jsonb_array_length(payload -> 'ids') BETWEEN 1 AND 20
            AND NOT jsonb_path_exists(payload, '$.ids[*] ? (@.type() != "string")')
            AND payload - 'ids' = '{}'::jsonb)
        OR (kind = 'geocode'
            AND jsonb_typeof(payload) = 'object'
            AND jsonb_typeof(payload -> 'latitude') = 'number'
            AND jsonb_typeof(payload -> 'longitude') = 'number'
            AND jsonb_typeof(payload -> 'label') = 'string'
            AND char_length(payload ->> 'label') BETWEEN 1 AND 120
            AND payload - 'latitude' - 'longitude' - 'label' = '{}'::jsonb),
        false))
);

CREATE INDEX IF NOT EXISTS google_cache_fetched_at_idx ON public.google_cache (fetched_at);

ALTER TABLE public.google_cache ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.google_cache FROM anon, authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';

SELECT relname, relrowsecurity
FROM pg_class
WHERE oid = 'public.google_cache'::regclass;
