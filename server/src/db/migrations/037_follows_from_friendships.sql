BEGIN;

CREATE TABLE IF NOT EXISTS public.follow_backfill_037 (
    follower_id UUID NOT NULL,
    followed_id UUID NOT NULL,
    added_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (follower_id, followed_id)
);
ALTER TABLE public.follow_backfill_037 ENABLE ROW LEVEL SECURITY;

WITH wanted AS (
    SELECT requester_id AS follower_id, addressee_id AS followed_id, COALESCE(responded_at, requested_at) AS followed_at
    FROM public.friendships WHERE status = 'accepted'
    UNION ALL
    SELECT addressee_id, requester_id, COALESCE(responded_at, requested_at)
    FROM public.friendships WHERE status = 'accepted'
    UNION ALL
    SELECT requester_id, addressee_id, requested_at
    FROM public.friendships WHERE status = 'pending'
), allowed AS (
    SELECT w.follower_id, w.followed_id, MIN(w.followed_at) AS followed_at
    FROM wanted w
    WHERE NOT EXISTS (SELECT 1 FROM public.user_blocks b
                      WHERE (b.blocker_id = w.follower_id AND b.blocked_id = w.followed_id)
                         OR (b.blocker_id = w.followed_id AND b.blocked_id = w.follower_id))
    GROUP BY w.follower_id, w.followed_id
), added AS (
    INSERT INTO public.user_follows (follower_id, followed_id, followed_at)
    SELECT follower_id, followed_id, followed_at FROM allowed
    ON CONFLICT (follower_id, followed_id) DO NOTHING
    RETURNING follower_id, followed_id
)
INSERT INTO public.follow_backfill_037 (follower_id, followed_id)
SELECT follower_id, followed_id FROM added
ON CONFLICT (follower_id, followed_id) DO NOTHING;

COMMIT;

SELECT
    (SELECT COUNT(DISTINCT (LEAST(requester_id, addressee_id), GREATEST(requester_id, addressee_id)))
       FROM public.friendships WHERE status = 'accepted') AS accepted_pairs,
    (SELECT COUNT(*) FROM public.friendships WHERE status = 'pending') AS pending_requests,
    (SELECT COUNT(*) FROM public.user_follows a
       JOIN public.user_follows b ON b.follower_id = a.followed_id AND b.followed_id = a.follower_id
      WHERE a.follower_id < a.followed_id) AS mutual_follow_pairs,
    (SELECT COUNT(*) FROM public.friendships f
      WHERE f.status IN ('accepted', 'pending')
        AND NOT EXISTS (SELECT 1 FROM public.user_blocks b
                        WHERE (b.blocker_id = f.requester_id AND b.blocked_id = f.addressee_id)
                           OR (b.blocker_id = f.addressee_id AND b.blocked_id = f.requester_id))
        AND NOT (EXISTS (SELECT 1 FROM public.user_follows u WHERE u.follower_id = f.requester_id AND u.followed_id = f.addressee_id)
                 AND (f.status = 'pending'
                      OR EXISTS (SELECT 1 FROM public.user_follows u WHERE u.follower_id = f.addressee_id AND u.followed_id = f.requester_id)))
    ) AS friendships_missing_a_follow,
    (SELECT COUNT(*) FROM public.friendships f
      WHERE f.status IN ('accepted', 'pending')
        AND EXISTS (SELECT 1 FROM public.user_blocks b
                    WHERE (b.blocker_id = f.requester_id AND b.blocked_id = f.addressee_id)
                       OR (b.blocker_id = f.addressee_id AND b.blocked_id = f.requester_id))
    ) AS skipped_for_block,
    (SELECT COUNT(*) FROM public.follow_backfill_037) AS follows_added;
