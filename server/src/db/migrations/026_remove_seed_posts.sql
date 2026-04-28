DELETE FROM public.feed_posts
WHERE image_url LIKE '%picsum.photos%';

UPDATE public.locations
SET photo_url = NULL
WHERE photo_url LIKE '%picsum.photos%';
