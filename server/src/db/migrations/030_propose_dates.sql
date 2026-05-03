-- 030_propose_dates.sql
-- Adds proposed_by to party_dates so any member can propose a date.
-- Enables realtime on party_dates and date_votes for live vote-count updates.

ALTER TABLE public.party_dates
  ADD COLUMN IF NOT EXISTS proposed_by UUID REFERENCES public.users(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'party_dates'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.party_dates';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'date_votes'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.date_votes';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
