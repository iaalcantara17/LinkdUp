BEGIN;

UPDATE public.locations
SET photo_url = CASE
    WHEN photo_url ~ '^https://places\.googleapis\.com/v1/places/[A-Za-z0-9_-]+/photos/[A-Za-z0-9_-]+/media\?'
        THEN '/api/photo?name=' || replace(
            substring(photo_url from '^https://places\.googleapis\.com/v1/(places/[A-Za-z0-9_-]+/photos/[A-Za-z0-9_-]+)/media\?'),
            '/', '%2F')
    ELSE NULL
END
WHERE photo_url LIKE '%key=%'
   OR photo_url ILIKE '%photo_reference=%'
   OR photo_url ILIKE '%photoreference=%'
   OR photo_url LIKE '/api/photo?ref=%';

UPDATE public.discover_likes
SET photo_url = CASE
    WHEN photo_url ~ '^https://places\.googleapis\.com/v1/places/[A-Za-z0-9_-]+/photos/[A-Za-z0-9_-]+/media\?'
        THEN '/api/photo?name=' || replace(
            substring(photo_url from '^https://places\.googleapis\.com/v1/(places/[A-Za-z0-9_-]+/photos/[A-Za-z0-9_-]+)/media\?'),
            '/', '%2F')
    ELSE NULL
END
WHERE photo_url LIKE '%key=%'
   OR photo_url ILIKE '%photo_reference=%'
   OR photo_url ILIKE '%photoreference=%'
   OR photo_url LIKE '/api/photo?ref=%';

COMMIT;

SELECT 'locations' AS table_name,
       count(*) FILTER (WHERE photo_url LIKE '%key=%') AS keyed_urls_left,
       count(*) FILTER (WHERE photo_url ILIKE '%reference=%' OR photo_url LIKE '/api/photo?ref=%') AS legacy_refs_left
FROM public.locations
UNION ALL
SELECT 'discover_likes',
       count(*) FILTER (WHERE photo_url LIKE '%key=%'),
       count(*) FILTER (WHERE photo_url ILIKE '%reference=%' OR photo_url LIKE '/api/photo?ref=%')
FROM public.discover_likes;
