-- =============================================================================
-- 004_avatar_url.sql
-- Run this in the Supabase SQL Editor.
--
-- Adds an avatar_url column to public.users so users can upload a profile
-- photo. The column is nullable; NULL means fall back to the initials avatar.
-- =============================================================================

ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
