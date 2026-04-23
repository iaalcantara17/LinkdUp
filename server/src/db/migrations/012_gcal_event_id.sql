-- 012_gcal_event_id.sql
-- Persists the Google Calendar event ID on a party so it can be deleted
-- when the party is deleted or when a member leaves.
ALTER TABLE public.parties ADD COLUMN IF NOT EXISTS gcal_event_id TEXT;

NOTIFY pgrst, 'reload schema';
