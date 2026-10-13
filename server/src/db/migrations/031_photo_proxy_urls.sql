BEGIN;

UPDATE public.locations
SET photo_url = CASE
    WHEN photo_url ~ '^https://places\.googleapis\.com/v1/places/[A-Za-z0-9_-]+/photos/[A-Za-z0-9_-]+/media\?'
        THEN '/api/photo?name=' || replace(
            substring(photo_url from '^https://places\.googleapis\.com/v1/(places/[A-Za-z0-9_-]+/photos/[A-Za-z0-9_-]+)/media\?'),
            '/', '%2F')
    WHEN photo_url ~ '^https://maps\.googleapis\.com/maps/api/place/photo\?(.*&)?photo_reference=[A-Za-z0-9_-]{16,}(&|$)'
        THEN '/api/photo?ref=' || substring(photo_url from '[?&]photo_reference=([A-Za-z0-9_-]+)')
    ELSE NULL
END
WHERE photo_url LIKE '%key=%';

UPDATE public.discover_likes
SET photo_url = CASE
    WHEN photo_url ~ '^https://places\.googleapis\.com/v1/places/[A-Za-z0-9_-]+/photos/[A-Za-z0-9_-]+/media\?'
        THEN '/api/photo?name=' || replace(
            substring(photo_url from '^https://places\.googleapis\.com/v1/(places/[A-Za-z0-9_-]+/photos/[A-Za-z0-9_-]+)/media\?'),
            '/', '%2F')
    WHEN photo_url ~ '^https://maps\.googleapis\.com/maps/api/place/photo\?(.*&)?photo_reference=[A-Za-z0-9_-]{16,}(&|$)'
        THEN '/api/photo?ref=' || substring(photo_url from '[?&]photo_reference=([A-Za-z0-9_-]+)')
    ELSE NULL
END
WHERE photo_url LIKE '%key=%';

COMMIT;

SELECT 'locations' AS table_name, count(*) FILTER (WHERE photo_url LIKE '%key=%') AS keyed_urls_left FROM public.locations
UNION ALL
SELECT 'discover_likes', count(*) FILTER (WHERE photo_url LIKE '%key=%') FROM public.discover_likes;
