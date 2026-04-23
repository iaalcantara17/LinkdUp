-- 009_venue_rotation.sql
-- Adds a rotation counter so load-more can cycle through different
-- category buckets when the Places pagination token is exhausted.
ALTER TABLE public.parties ADD COLUMN IF NOT EXISTS venue_rotation_seed INT DEFAULT 0;
