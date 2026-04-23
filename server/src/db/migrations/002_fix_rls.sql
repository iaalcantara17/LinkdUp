-- =============================================================================
-- 002_fix_rls.sql
-- Run this entire file in the Supabase SQL Editor (Dashboard → SQL Editor → New query).
--
-- ROOT CAUSE
-- ----------
-- party_members_self_read policy contains an OR EXISTS subquery that references
-- public.party_members from within the policy ON public.party_members.
-- PostgreSQL applies the policy to the inner query too, causing infinite recursion.
-- The error surfaces as:
--   "infinite recursion detected in policy for relation 'party_members'"
-- and breaks any query (including INSERT ... RETURNING) that touches parties or
-- party_members when RLS is evaluated (e.g. if "Force Row Level Security" is
-- enabled in the Supabase dashboard for these tables).
--
-- FIX STRATEGY
-- ------------
-- 1. Replace the recursive party_members SELECT policy with a simple
--    user_id = auth.uid() check.  Co-member visibility is NOT needed for the
--    app's security model; the Express backend reads all members via service_role.
--
-- 2. Add explicit INSERT / UPDATE / DELETE policies for every table the backend
--    writes to.  Supabase's service_role normally bypasses RLS, but if "Force
--    Row Level Security" is toggled on in the dashboard the backend needs these
--    policies to write successfully.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- PARTY_MEMBERS – fix the recursive SELECT policy
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "party_members_self_read" ON public.party_members;

-- Simple, non-recursive: a user can see only their own membership rows.
-- The backend reads all party members via service_role (bypasses RLS).
CREATE POLICY "party_members_self_read" ON public.party_members
    FOR SELECT USING (user_id = auth.uid());

-- INSERT: allow the backend (and any future direct client) to join parties.
DROP POLICY IF EXISTS "party_members_insert" ON public.party_members;
CREATE POLICY "party_members_insert" ON public.party_members
    FOR INSERT WITH CHECK (true);

-- UPDATE: only the member themselves, or the party host, can change a member row.
DROP POLICY IF EXISTS "party_members_update" ON public.party_members;
CREATE POLICY "party_members_update" ON public.party_members
    FOR UPDATE USING (
        user_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.parties
            WHERE id = party_members.party_id
              AND host_user_id = auth.uid()
        )
    );

-- DELETE: leave = delete your own row; host can also remove members.
DROP POLICY IF EXISTS "party_members_delete" ON public.party_members;
CREATE POLICY "party_members_delete" ON public.party_members
    FOR DELETE USING (
        user_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.parties
            WHERE id = party_members.party_id
              AND host_user_id = auth.uid()
        )
    );


-- ---------------------------------------------------------------------------
-- PARTIES – add missing write policies
-- ---------------------------------------------------------------------------

-- INSERT: authenticated users can create parties (host_user_id must match caller).
DROP POLICY IF EXISTS "parties_insert" ON public.parties;
CREATE POLICY "parties_insert" ON public.parties
    FOR INSERT WITH CHECK (auth.uid() = host_user_id);

-- UPDATE: only the host can update their party.
DROP POLICY IF EXISTS "parties_update" ON public.parties;
CREATE POLICY "parties_update" ON public.parties
    FOR UPDATE USING (auth.uid() = host_user_id);

-- DELETE: only the host can delete their party.
DROP POLICY IF EXISTS "parties_delete" ON public.parties;
CREATE POLICY "parties_delete" ON public.parties
    FOR DELETE USING (auth.uid() = host_user_id);


-- ---------------------------------------------------------------------------
-- LOCATIONS – add missing write policies
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "locations_insert" ON public.locations;
CREATE POLICY "locations_insert" ON public.locations
    FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "locations_delete" ON public.locations;
CREATE POLICY "locations_delete" ON public.locations
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.parties
            WHERE id = locations.party_id AND host_user_id = auth.uid()
        )
    );


-- ---------------------------------------------------------------------------
-- VOTES – add missing write policies
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "votes_insert" ON public.votes;
CREATE POLICY "votes_insert" ON public.votes
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "votes_update" ON public.votes;
CREATE POLICY "votes_update" ON public.votes
    FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "votes_delete" ON public.votes;
CREATE POLICY "votes_delete" ON public.votes
    FOR DELETE USING (auth.uid() = user_id);


-- ---------------------------------------------------------------------------
-- PARTY_DATES – add missing write policies
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "party_dates_insert" ON public.party_dates;
CREATE POLICY "party_dates_insert" ON public.party_dates
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.parties
            WHERE id = party_dates.party_id AND host_user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "party_dates_delete" ON public.party_dates;
CREATE POLICY "party_dates_delete" ON public.party_dates
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.parties
            WHERE id = party_dates.party_id AND host_user_id = auth.uid()
        )
    );


-- ---------------------------------------------------------------------------
-- DATE_VOTES – add missing write policies
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "date_votes_insert" ON public.date_votes;
CREATE POLICY "date_votes_insert" ON public.date_votes
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "date_votes_update" ON public.date_votes;
CREATE POLICY "date_votes_update" ON public.date_votes
    FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "date_votes_delete" ON public.date_votes;
CREATE POLICY "date_votes_delete" ON public.date_votes
    FOR DELETE USING (auth.uid() = user_id);


-- ---------------------------------------------------------------------------
-- USERS – add missing write policies
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "users_self_insert" ON public.users;
CREATE POLICY "users_self_insert" ON public.users
    FOR INSERT WITH CHECK (auth.uid() = id);


-- ---------------------------------------------------------------------------
-- Reload PostgREST schema cache after policy changes.
-- ---------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
