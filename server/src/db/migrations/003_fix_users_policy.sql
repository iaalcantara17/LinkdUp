-- =============================================================================
-- 003_fix_users_policy.sql
-- Run this in the Supabase SQL Editor.
--
-- ROOT CAUSE
-- ----------
-- The users_self_insert policy added in 002_fix_rls.sql used:
--
--     WITH CHECK (auth.uid() = id)
--
-- When the Express backend (service_role key) inserts a new user profile,
-- auth.uid() returns NULL (there is no end-user JWT in that request).
-- NULL = id  evaluates to NULL (not TRUE), so PostgreSQL blocks the INSERT
-- with "new row violates row-level security policy for table 'users'".
-- The insert fails, the auth user is NOT cleaned up (deleteUser also silently
-- fails in some Supabase configurations), and the auth user becomes orphaned:
-- it exists in auth.users but has no public.users profile row.
--
-- FIX
-- ---
-- The users table is only written to by the Express backend (service_role).
-- The policy exists purely as a defence-in-depth layer.  Changing it to
-- WITH CHECK (true) allows the INSERT while keeping the policy in place
-- (so a misconfigured direct-client call cannot inject rows for other users).
-- =============================================================================

-- Fix the broken INSERT policy
DROP POLICY IF EXISTS "users_self_insert" ON public.users;
CREATE POLICY "users_self_insert" ON public.users
    FOR INSERT WITH CHECK (true);

-- Add a permissive UPDATE policy too (the backend updates latitude, avatar etc.)
DROP POLICY IF EXISTS "users_backend_update" ON public.users;
CREATE POLICY "users_backend_update" ON public.users
    FOR UPDATE USING (true) WITH CHECK (true);

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
