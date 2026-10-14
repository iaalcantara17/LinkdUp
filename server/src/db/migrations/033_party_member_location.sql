ALTER TABLE public.party_members
    ADD COLUMN IF NOT EXISTS live_latitude    double precision CHECK (live_latitude BETWEEN -90 AND 90),
    ADD COLUMN IF NOT EXISTS live_longitude   double precision CHECK (live_longitude BETWEEN -180 AND 180),
    ADD COLUMN IF NOT EXISTS live_at          timestamptz,
    ADD COLUMN IF NOT EXISTS custom_latitude  double precision CHECK (custom_latitude BETWEEN -90 AND 90),
    ADD COLUMN IF NOT EXISTS custom_longitude double precision CHECK (custom_longitude BETWEEN -180 AND 180),
    ADD COLUMN IF NOT EXISTS custom_label     text CHECK (char_length(custom_label) BETWEEN 1 AND 120),
    ADD COLUMN IF NOT EXISTS location_mode    text NOT NULL DEFAULT 'live' CHECK (location_mode IN ('live', 'custom'));

NOTIFY pgrst, 'reload schema';

SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'party_members'
  AND column_name IN ('live_latitude', 'live_longitude', 'live_at', 'custom_latitude', 'custom_longitude', 'custom_label', 'location_mode')
ORDER BY column_name;
