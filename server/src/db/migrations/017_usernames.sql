ALTER TABLE public.users ADD COLUMN IF NOT EXISTS username TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_idx
    ON public.users (LOWER(username));

DO $$
DECLARE u RECORD;
    base TEXT;
    candidate TEXT;
    n INT;
BEGIN
    FOR u IN SELECT id, display_name FROM public.users WHERE username IS NULL LOOP
        base := lower(regexp_replace(coalesce(u.display_name, 'user'), '[^a-zA-Z0-9_]', '_', 'g'));
        base := regexp_replace(base, '^[0-9_]+', '', 'g');
        IF length(base) < 3 THEN base := base || 'user'; END IF;
        IF length(base) > 16 THEN base := substr(base, 1, 16); END IF;
        candidate := base;
        n := 1;
        WHILE EXISTS (SELECT 1 FROM public.users WHERE LOWER(username) = candidate) LOOP
            n := n + 1;
            candidate := base || '_' || n;
        END LOOP;
        UPDATE public.users SET username = candidate WHERE id = u.id;
    END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
