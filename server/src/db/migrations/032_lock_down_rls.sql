BEGIN;

ALTER TABLE public.users                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schools              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parties              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.party_members        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locations            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.votes                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.party_dates          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.date_votes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposal_responses   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discover_likes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friendships          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_screen_hints    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feed_posts           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feed_likes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feed_bookmarks       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feed_comments        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_follows         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookmark_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_blocks          ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "feed_posts_all_backend"           ON public.feed_posts;
DROP POLICY IF EXISTS "feed_comments_all_backend"        ON public.feed_comments;
DROP POLICY IF EXISTS "feed_likes_all_backend"           ON public.feed_likes;
DROP POLICY IF EXISTS "feed_bookmarks_all_backend"       ON public.feed_bookmarks;
DROP POLICY IF EXISTS "user_follows_all_backend"         ON public.user_follows;
DROP POLICY IF EXISTS "friendships_all_backend"          ON public.friendships;
DROP POLICY IF EXISTS "user_blocks_all_backend"          ON public.user_blocks;
DROP POLICY IF EXISTS "bookmark_collections_all_backend" ON public.bookmark_collections;
DROP POLICY IF EXISTS "proposal_responses_all_backend"   ON public.proposal_responses;
DROP POLICY IF EXISTS "discover_likes_all_backend"       ON public.discover_likes;
DROP POLICY IF EXISTS "user_screen_hints_all_backend"    ON public.user_screen_hints;
DROP POLICY IF EXISTS "users_backend_update"             ON public.users;
DROP POLICY IF EXISTS "users_self_update"                ON public.users;
DROP POLICY IF EXISTS "users_self_insert"                ON public.users;
DROP POLICY IF EXISTS "party_members_insert"             ON public.party_members;
DROP POLICY IF EXISTS "locations_insert"                 ON public.locations;

DROP POLICY IF EXISTS "users_self_read"            ON public.users;
DROP POLICY IF EXISTS "schools_read_authenticated" ON public.schools;
DROP POLICY IF EXISTS "parties_insert"             ON public.parties;
DROP POLICY IF EXISTS "parties_update"             ON public.parties;
DROP POLICY IF EXISTS "parties_delete"             ON public.parties;
DROP POLICY IF EXISTS "party_members_update"       ON public.party_members;
DROP POLICY IF EXISTS "party_members_delete"       ON public.party_members;
DROP POLICY IF EXISTS "locations_member_read"      ON public.locations;
DROP POLICY IF EXISTS "locations_delete"           ON public.locations;
DROP POLICY IF EXISTS "votes_insert"               ON public.votes;
DROP POLICY IF EXISTS "votes_update"               ON public.votes;
DROP POLICY IF EXISTS "votes_delete"               ON public.votes;
DROP POLICY IF EXISTS "party_dates_insert"         ON public.party_dates;
DROP POLICY IF EXISTS "party_dates_delete"         ON public.party_dates;
DROP POLICY IF EXISTS "date_votes_insert"          ON public.date_votes;
DROP POLICY IF EXISTS "date_votes_update"          ON public.date_votes;
DROP POLICY IF EXISTS "date_votes_delete"          ON public.date_votes;

DROP POLICY IF EXISTS "parties_member_read" ON public.parties;
CREATE POLICY "parties_member_read" ON public.parties
    FOR SELECT TO authenticated USING (
        EXISTS (SELECT 1 FROM public.party_members pm
                WHERE pm.party_id = parties.id AND pm.user_id = auth.uid())
    );

DROP POLICY IF EXISTS "party_members_self_read" ON public.party_members;
CREATE POLICY "party_members_self_read" ON public.party_members
    FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "votes_member_read" ON public.votes;
CREATE POLICY "votes_member_read" ON public.votes
    FOR SELECT TO authenticated USING (
        EXISTS (SELECT 1 FROM public.party_members pm
                WHERE pm.party_id = votes.party_id AND pm.user_id = auth.uid())
    );

DROP POLICY IF EXISTS "party_dates_member_read" ON public.party_dates;
CREATE POLICY "party_dates_member_read" ON public.party_dates
    FOR SELECT TO authenticated USING (
        EXISTS (SELECT 1 FROM public.party_members pm
                WHERE pm.party_id = party_dates.party_id AND pm.user_id = auth.uid())
    );

DROP POLICY IF EXISTS "date_votes_member_read" ON public.date_votes;
CREATE POLICY "date_votes_member_read" ON public.date_votes
    FOR SELECT TO authenticated USING (
        EXISTS (SELECT 1 FROM public.party_dates pd
                JOIN public.party_members pm ON pm.party_id = pd.party_id
                WHERE pd.id = date_votes.party_date_id AND pm.user_id = auth.uid())
    );

DROP POLICY IF EXISTS "proposal_responses_member_read" ON public.proposal_responses;
CREATE POLICY "proposal_responses_member_read" ON public.proposal_responses
    FOR SELECT TO authenticated USING (
        EXISTS (SELECT 1 FROM public.party_members pm
                WHERE pm.party_id = proposal_responses.party_id AND pm.user_id = auth.uid())
    );

COMMIT;

NOTIFY pgrst, 'reload schema';

SELECT tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND (qual = 'true' OR with_check = 'true');

SELECT tablename, policyname, roles, cmd
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
