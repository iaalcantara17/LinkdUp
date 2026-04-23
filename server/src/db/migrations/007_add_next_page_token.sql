-- 007_add_next_page_token.sql
-- Persists the Google Places Legacy API pagination token in the DB
-- so /more-venues pagination survives server restarts.
ALTER TABLE public.parties ADD COLUMN IF NOT EXISTS next_page_token TEXT;
