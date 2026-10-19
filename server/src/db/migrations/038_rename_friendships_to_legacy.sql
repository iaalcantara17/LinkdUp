BEGIN;

DO $$
BEGIN
    IF to_regclass('public.friendships') IS NOT NULL AND to_regclass('public.friendships_legacy') IS NULL THEN
        ALTER TABLE public.friendships RENAME TO friendships_legacy;
    END IF;
END
$$;

ALTER TABLE public.friendships_legacy ENABLE ROW LEVEL SECURITY;

COMMIT;

NOTIFY pgrst, 'reload schema';

SELECT
    to_regclass('public.friendships_legacy') IS NOT NULL AS legacy_table_exists,
    to_regclass('public.friendships') IS NULL AS old_name_gone,
    (SELECT c.relrowsecurity FROM pg_class c WHERE c.oid = 'public.friendships_legacy'::regclass) AS rls_enabled,
    (SELECT COUNT(*) FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = 'friendships_legacy') AS policies,
    (SELECT COUNT(*) FROM public.friendships_legacy) AS rows_kept;
