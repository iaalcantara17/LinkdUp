-- 010_profile_fields.sql
-- Adds pronouns, birthday, and bio to the users table.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS pronouns TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS birthday DATE;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS bio TEXT;
