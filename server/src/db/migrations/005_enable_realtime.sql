-- Migration 005: Enable Supabase Realtime on votes and party_members tables.
-- Run this once in the Supabase SQL editor (or via psql).
-- Idempotent: ADD TABLE is safe to re-run; Postgres silently ignores duplicates.

ALTER PUBLICATION supabase_realtime ADD TABLE public.votes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.party_members;

-- Notify PostgREST to reload its schema cache
NOTIFY pgrst, 'reload schema';
