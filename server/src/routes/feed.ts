import { Router } from 'express';
import { requireAuth, AuthedRequest } from '../middleware/auth';
import { HttpError } from '../middleware/error';
import { supabaseAdmin } from '../db';
import { distanceMiles } from '../services/midpoint';
import { config } from '../config';

const router = Router();

router.get('/feed', requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        const me = req.user!.id;
        const limit = Math.min(parseInt((req.query.limit as string) ?? '20', 10), 50);
        const after = req.query.after as string | undefined;
        const lat = req.query.lat ? parseFloat(req.query.lat as string) : null;
        const lng = req.query.lng ? parseFloat(req.query.lng as string) : null;

        const { data: blockRows } = await supabaseAdmin
            .from('user_blocks')
            .select('blocker_id, blocked_id')
            .or(`blocker_id.eq.${me},blocked_id.eq.${me}`);
        const blockedCreatorIds = new Set<string>();
        for (const row of blockRows ?? []) {
            blockedCreatorIds.add(row.blocker_id === me ? row.blocked_id : row.blocker_id);
        }

        let query = supabaseAdmin
            .from('feed_posts')
            .select('*')
            .order('created_at', { ascending: true })
            .limit(limit + 1);

        if (after) query = query.gt('created_at', after);

        const { data: posts, error } = await query;
        if (error) throw new HttpError(500, 'feed_query_failed', error.message);

        const rawPosts = (posts ?? []).filter((p: any) => !blockedCreatorIds.has(p.creator_id));
        const has_more = rawPosts.length > limit;
        const items = rawPosts.slice(0, limit);

        if (items.length === 0) {
            return res.json({ posts: [], has_more: false, next_cursor: null });
        }

        const postIds = items.map((p: any) => p.id as string);
        const creatorIds = [...new Set(items.map((p: any) => p.creator_id as string))];

        const userMap = new Map<string, any>();
        if (creatorIds.length > 0) {
            const { data: users } = await supabaseAdmin
                .from('users')
                .select('id, display_name, username, avatar_url')
                .in('id', creatorIds);
            for (const u of users ?? []) userMap.set(u.id, u);
        }

        const [allLikesRes, myLikesRes, myBookmarksRes, allCommentsRes, followsRes] = await Promise.all([
            supabaseAdmin.from('feed_likes').select('post_id').in('post_id', postIds),
            supabaseAdmin.from('feed_likes').select('post_id').in('post_id', postIds).eq('user_id', me),
            supabaseAdmin.from('feed_bookmarks').select('post_id').in('post_id', postIds).eq('user_id', me),
            supabaseAdmin.from('feed_comments').select('post_id').in('post_id', postIds),
            creatorIds.length > 0
                ? supabaseAdmin.from('user_follows').select('followed_id').eq('follower_id', me).in('followed_id', creatorIds)
                : Promise.resolve({ data: [] }),
        ]);

        const likeCounts = new Map<string, number>();
        for (const r of allLikesRes.data ?? []) {
            likeCounts.set(r.post_id, (likeCounts.get(r.post_id) ?? 0) + 1);
        }

        const commentCounts = new Map<string, number>();
        for (const r of allCommentsRes.data ?? []) {
            commentCounts.set(r.post_id, (commentCounts.get(r.post_id) ?? 0) + 1);
        }

        const myLikedSet = new Set((myLikesRes.data ?? []).map((r: any) => r.post_id as string));
        const myBookmarkedSet = new Set((myBookmarksRes.data ?? []).map((r: any) => r.post_id as string));
        const followedSet = new Set(((followsRes as any).data ?? []).map((r: any) => r.followed_id as string));

        const callerLoc = lat != null && lng != null ? { latitude: lat, longitude: lng } : null;

        const enriched = items.map((p: any) => {
            const creator = userMap.get(p.creator_id) ?? {};
            let distance_miles: number | null = null;
            if (callerLoc && p.venue_latitude != null && p.venue_longitude != null) {
                distance_miles = parseFloat(
                    distanceMiles(callerLoc, { latitude: p.venue_latitude, longitude: p.venue_longitude }).toFixed(1)
                );
            }
            return {
                ...p,
                creator_display_name: creator.display_name ?? 'User',
                creator_username: creator.username ?? null,
                creator_avatar_url: creator.avatar_url ?? null,
                distance_miles,
                like_count: likeCounts.get(p.id) ?? 0,
                comment_count: commentCounts.get(p.id) ?? 0,
                liked_by_me: myLikedSet.has(p.id),
                bookmarked_by_me: myBookmarkedSet.has(p.id),
                follows_creator: followedSet.has(p.creator_id),
            };
        });

        const next_cursor = has_more && items.length > 0 ? items[items.length - 1].created_at : null;
        res.json({ posts: enriched, has_more, next_cursor });
    } catch (e) {
        next(e);
    }
});

router.post('/feed/posts', requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        const me = req.user!.id;
        const { image_url, caption, venue_name, venue_address, venue_latitude, venue_longitude, venue_google_place_id } = req.body;

        if (!image_url) throw new HttpError(400, 'missing_image_url');
        if (!venue_name) throw new HttpError(400, 'missing_venue_name');
        if (caption && caption.length > 500) throw new HttpError(400, 'caption_too_long');

        const { data: post, error } = await supabaseAdmin
            .from('feed_posts')
            .insert({
                creator_id: me,
                image_url,
                caption: caption ?? null,
                venue_name,
                venue_address: venue_address ?? null,
                venue_latitude: venue_latitude ?? null,
                venue_longitude: venue_longitude ?? null,
                venue_google_place_id: venue_google_place_id ?? null,
            })
            .select()
            .single();
        if (error || !post) throw new HttpError(500, 'post_create_failed', error?.message);

        const { data: creator } = await supabaseAdmin
            .from('users')
            .select('display_name, username, avatar_url')
            .eq('id', me)
            .single();

        res.status(201).json({
            ...post,
            creator_display_name: creator?.display_name ?? 'User',
            creator_username: creator?.username ?? null,
            creator_avatar_url: creator?.avatar_url ?? null,
            like_count: 0,
            comment_count: 0,
            liked_by_me: false,
            bookmarked_by_me: false,
            follows_creator: false,
        });
    } catch (e) {
        next(e);
    }
});

router.post('/feed/upload-url', requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        const me = req.user!.id;
        const ext = (req.body.ext as string | undefined) ?? 'jpg';
        const filePath = `${me}/${Date.now()}.${ext}`;

        const { data, error } = await supabaseAdmin.storage
            .from('feed-photos')
            .createSignedUploadUrl(filePath);

        if (error || !data) throw new HttpError(500, 'upload_url_failed', error?.message);

        const public_url = `${config.supabase.url}/storage/v1/object/public/feed-photos/${filePath}`;
        res.json({ upload_url: data.signedUrl, public_url, file_path: filePath });
    } catch (e) {
        next(e);
    }
});

router.post('/feed/posts/:id/like', requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        const me = req.user!.id;
        const postId = req.params.id;

        const { error } = await supabaseAdmin
            .from('feed_likes')
            .upsert({ user_id: me, post_id: postId }, { onConflict: 'user_id,post_id' });
        if (error) throw new HttpError(500, 'like_failed', error.message);

        res.json({ ok: true });
    } catch (e) {
        next(e);
    }
});

router.delete('/feed/posts/:id/like', requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        const { error } = await supabaseAdmin
            .from('feed_likes')
            .delete()
            .eq('user_id', req.user!.id)
            .eq('post_id', req.params.id);
        if (error) throw new HttpError(500, 'unlike_failed', error.message);
        res.json({ ok: true });
    } catch (e) {
        next(e);
    }
});

router.post('/feed/posts/:id/bookmark', requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        const me = req.user!.id;
        const postId = req.params.id;
        const collectionId: string | null = req.body?.collection_id ?? null;

        if (collectionId) {
            const { data: col } = await supabaseAdmin
                .from('bookmark_collections')
                .select('id')
                .eq('id', collectionId)
                .eq('user_id', me)
                .maybeSingle();
            if (!col) throw new HttpError(404, 'collection_not_found');
        }

        const { error } = await supabaseAdmin
            .from('feed_bookmarks')
            .upsert(
                { user_id: me, post_id: postId, collection_id: collectionId },
                { onConflict: 'user_id,post_id' }
            );
        if (error) throw new HttpError(500, 'bookmark_failed', error.message);

        res.json({ ok: true });
    } catch (e) {
        next(e);
    }
});

router.delete('/feed/posts/:id/bookmark', requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        const { error } = await supabaseAdmin
            .from('feed_bookmarks')
            .delete()
            .eq('user_id', req.user!.id)
            .eq('post_id', req.params.id);
        if (error) throw new HttpError(500, 'unbookmark_failed', error.message);
        res.json({ ok: true });
    } catch (e) {
        next(e);
    }
});

router.get('/feed/posts/:id/comments', requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        const { data: comments, error } = await supabaseAdmin
            .from('feed_comments')
            .select('id, post_id, author_id, body, created_at')
            .eq('post_id', req.params.id)
            .order('created_at', { ascending: false });
        if (error) throw new HttpError(500, 'comments_query_failed', error.message);

        const items = comments ?? [];
        const authorIds = [...new Set(items.map((c: any) => c.author_id as string))];

        const authorMap = new Map<string, any>();
        if (authorIds.length > 0) {
            const { data: authors } = await supabaseAdmin
                .from('users')
                .select('id, display_name, username, avatar_url')
                .in('id', authorIds);
            for (const a of authors ?? []) authorMap.set(a.id, a);
        }

        const enriched = items.map((c: any) => {
            const author = authorMap.get(c.author_id) ?? {};
            return {
                ...c,
                author_display_name: author.display_name ?? 'User',
                author_username: author.username ?? null,
                author_avatar_url: author.avatar_url ?? null,
            };
        });

        res.json(enriched);
    } catch (e) {
        next(e);
    }
});

router.post('/feed/posts/:id/comments', requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        const me = req.user!.id;
        const { body } = req.body;
        if (!body || typeof body !== 'string' || body.trim().length === 0) throw new HttpError(400, 'empty_body');
        if (body.length > 500) throw new HttpError(400, 'body_too_long');

        const { data: postRow } = await supabaseAdmin
            .from('feed_posts')
            .select('creator_id')
            .eq('id', req.params.id)
            .single();
        if (postRow && postRow.creator_id !== me) {
            const { data: blockCheck } = await supabaseAdmin
                .from('user_blocks')
                .select('blocker_id')
                .or(`and(blocker_id.eq.${me},blocked_id.eq.${postRow.creator_id}),and(blocker_id.eq.${postRow.creator_id},blocked_id.eq.${me})`)
                .limit(1);
            if ((blockCheck ?? []).length > 0) throw new HttpError(403, 'blocked');
        }

        const { data: comment, error } = await supabaseAdmin
            .from('feed_comments')
            .insert({ post_id: req.params.id, author_id: me, body: body.trim() })
            .select()
            .single();
        if (error || !comment) throw new HttpError(500, 'comment_create_failed', error?.message);

        const { data: author } = await supabaseAdmin
            .from('users')
            .select('display_name, username, avatar_url')
            .eq('id', me)
            .single();

        res.status(201).json({
            ...comment,
            author_display_name: author?.display_name ?? 'User',
            author_username: author?.username ?? null,
            author_avatar_url: author?.avatar_url ?? null,
        });
    } catch (e) {
        next(e);
    }
});

router.delete('/feed/comments/:id', requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        const me = req.user!.id;

        const { data: comment } = await supabaseAdmin
            .from('feed_comments')
            .select('author_id')
            .eq('id', req.params.id)
            .single();
        if (!comment) throw new HttpError(404, 'comment_not_found');
        if (comment.author_id !== me) throw new HttpError(403, 'not_comment_author');

        const { error } = await supabaseAdmin
            .from('feed_comments')
            .delete()
            .eq('id', req.params.id);
        if (error) throw new HttpError(500, 'delete_failed', error.message);

        res.json({ ok: true });
    } catch (e) {
        next(e);
    }
});

router.patch('/feed/posts/:id', requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        const me = req.user!.id;
        const { caption } = req.body;

        if (caption !== undefined && caption !== null && typeof caption !== 'string') {
            throw new HttpError(400, 'invalid_caption');
        }
        if (typeof caption === 'string' && caption.length > 500) {
            throw new HttpError(400, 'caption_too_long');
        }

        const { data: post } = await supabaseAdmin
            .from('feed_posts')
            .select('creator_id')
            .eq('id', req.params.id)
            .maybeSingle();
        if (!post) throw new HttpError(404, 'post_not_found');
        if (post.creator_id !== me) throw new HttpError(403, 'not_post_author');

        const { error } = await supabaseAdmin
            .from('feed_posts')
            .update({ caption: caption ?? null })
            .eq('id', req.params.id);
        if (error) throw new HttpError(500, 'update_failed', error.message);

        res.json({ ok: true });
    } catch (e) {
        next(e);
    }
});

router.delete('/feed/posts/:id', requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        const me = req.user!.id;

        const { data: post } = await supabaseAdmin
            .from('feed_posts')
            .select('creator_id')
            .eq('id', req.params.id)
            .maybeSingle();
        if (!post) throw new HttpError(404, 'post_not_found');
        if (post.creator_id !== me) throw new HttpError(403, 'not_post_author');

        const { error } = await supabaseAdmin
            .from('feed_posts')
            .delete()
            .eq('id', req.params.id);
        if (error) throw new HttpError(500, 'delete_failed', error.message);

        res.json({ ok: true });
    } catch (e) {
        next(e);
    }
});

router.get('/feed/my-posts', requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        const me = req.user!.id;

        const { data: posts, error } = await supabaseAdmin
            .from('feed_posts')
            .select('*')
            .eq('creator_id', me)
            .order('created_at', { ascending: false });
        if (error) throw new HttpError(500, 'my_posts_query_failed', error.message);

        const items = posts ?? [];
        if (items.length === 0) return res.json({ posts: [] });

        const postIds = items.map((p: any) => p.id as string);

        const [allLikesRes, allCommentsRes] = await Promise.all([
            supabaseAdmin.from('feed_likes').select('post_id').in('post_id', postIds),
            supabaseAdmin.from('feed_comments').select('post_id').in('post_id', postIds),
        ]);

        const likeCounts = new Map<string, number>();
        for (const r of allLikesRes.data ?? []) {
            likeCounts.set(r.post_id, (likeCounts.get(r.post_id) ?? 0) + 1);
        }
        const commentCounts = new Map<string, number>();
        for (const r of allCommentsRes.data ?? []) {
            commentCounts.set(r.post_id, (commentCounts.get(r.post_id) ?? 0) + 1);
        }

        const enriched = items.map((p: any) => ({
            ...p,
            like_count: likeCounts.get(p.id) ?? 0,
            comment_count: commentCounts.get(p.id) ?? 0,
        }));

        res.json({ posts: enriched });
    } catch (e) {
        next(e);
    }
});

router.get('/feed/collections', requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        const me = req.user!.id;

        const { data, error } = await supabaseAdmin
            .from('bookmark_collections')
            .select('id, name, created_at')
            .eq('user_id', me)
            .order('created_at', { ascending: true });
        if (error) throw new HttpError(500, 'collections_query_failed', error.message);

        res.json(data ?? []);
    } catch (e) {
        next(e);
    }
});

router.post('/feed/collections', requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        const me = req.user!.id;
        const { name } = req.body;
        if (!name || typeof name !== 'string' || name.trim().length === 0) throw new HttpError(400, 'missing_name');
        if (name.trim().length > 50) throw new HttpError(400, 'name_too_long');

        const { data, error } = await supabaseAdmin
            .from('bookmark_collections')
            .insert({ user_id: me, name: name.trim() })
            .select()
            .single();
        if (error || !data) throw new HttpError(500, 'collection_create_failed', error?.message);

        res.status(201).json(data);
    } catch (e) {
        next(e);
    }
});

router.delete('/feed/collections/:id', requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        const me = req.user!.id;

        const { data: col } = await supabaseAdmin
            .from('bookmark_collections')
            .select('user_id')
            .eq('id', req.params.id)
            .maybeSingle();
        if (!col) throw new HttpError(404, 'collection_not_found');
        if (col.user_id !== me) throw new HttpError(403, 'not_collection_owner');

        const { error } = await supabaseAdmin
            .from('bookmark_collections')
            .delete()
            .eq('id', req.params.id);
        if (error) throw new HttpError(500, 'delete_failed', error.message);

        res.json({ ok: true });
    } catch (e) {
        next(e);
    }
});

router.get('/feed/saved', requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        const me = req.user!.id;
        const collectionId = req.query.collection_id as string | undefined;

        let bookmarkQuery = supabaseAdmin
            .from('feed_bookmarks')
            .select('post_id, collection_id, bookmarked_at')
            .eq('user_id', me)
            .order('bookmarked_at', { ascending: false });

        if (collectionId === 'none') {
            bookmarkQuery = bookmarkQuery.is('collection_id', null);
        } else if (collectionId) {
            bookmarkQuery = bookmarkQuery.eq('collection_id', collectionId);
        }

        const { data: bookmarks, error: bErr } = await bookmarkQuery;
        if (bErr) throw new HttpError(500, 'saved_query_failed', bErr.message);

        const items = bookmarks ?? [];
        if (items.length === 0) return res.json({ posts: [] });

        const postIds = items.map((b: any) => b.post_id as string);

        const { data: posts, error: pErr } = await supabaseAdmin
            .from('feed_posts')
            .select('*')
            .in('id', postIds);
        if (pErr) throw new HttpError(500, 'saved_posts_query_failed', pErr.message);

        const postMap = new Map((posts ?? []).map((p: any) => [p.id, p]));
        const creatorIds = [...new Set((posts ?? []).map((p: any) => p.creator_id as string))];

        const userMap = new Map<string, any>();
        if (creatorIds.length > 0) {
            const { data: users } = await supabaseAdmin
                .from('users')
                .select('id, display_name, username, avatar_url')
                .in('id', creatorIds);
            for (const u of users ?? []) userMap.set(u.id, u);
        }

        const [allLikesRes, myLikesRes, allCommentsRes] = await Promise.all([
            supabaseAdmin.from('feed_likes').select('post_id').in('post_id', postIds),
            supabaseAdmin.from('feed_likes').select('post_id').in('post_id', postIds).eq('user_id', me),
            supabaseAdmin.from('feed_comments').select('post_id').in('post_id', postIds),
        ]);

        const likeCounts = new Map<string, number>();
        for (const r of allLikesRes.data ?? []) {
            likeCounts.set(r.post_id, (likeCounts.get(r.post_id) ?? 0) + 1);
        }
        const commentCounts = new Map<string, number>();
        for (const r of allCommentsRes.data ?? []) {
            commentCounts.set(r.post_id, (commentCounts.get(r.post_id) ?? 0) + 1);
        }
        const myLikedSet = new Set((myLikesRes.data ?? []).map((r: any) => r.post_id as string));

        const enriched = items
            .map((b: any) => {
                const p = postMap.get(b.post_id);
                if (!p) return null;
                const creator = userMap.get(p.creator_id) ?? {};
                return {
                    ...p,
                    creator_display_name: creator.display_name ?? 'User',
                    creator_username: creator.username ?? null,
                    creator_avatar_url: creator.avatar_url ?? null,
                    like_count: likeCounts.get(p.id) ?? 0,
                    comment_count: commentCounts.get(p.id) ?? 0,
                    liked_by_me: myLikedSet.has(p.id),
                    bookmarked_by_me: true,
                    collection_id: b.collection_id ?? null,
                    bookmarked_at: b.bookmarked_at,
                };
            })
            .filter(Boolean);

        res.json({ posts: enriched });
    } catch (e) {
        next(e);
    }
});

router.post('/feed/posts/:id/add-to-party', requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        const me = req.user!.id;
        const { party_id } = req.body;
        if (!party_id) throw new HttpError(400, 'missing_party_id');

        const { data: membership } = await supabaseAdmin
            .from('party_members')
            .select('user_id')
            .eq('party_id', party_id)
            .eq('user_id', me)
            .maybeSingle();
        if (!membership) throw new HttpError(403, 'not_a_member');

        const { data: post } = await supabaseAdmin
            .from('feed_posts')
            .select('venue_name, venue_address, venue_latitude, venue_longitude, venue_google_place_id, image_url')
            .eq('id', req.params.id)
            .single();
        if (!post) throw new HttpError(404, 'post_not_found');
        if (post.venue_latitude == null || post.venue_longitude == null) {
            throw new HttpError(422, 'post_missing_coordinates');
        }

        const googlePlaceId = post.venue_google_place_id ?? `custom_feed_${req.params.id}`;

        const { data: location, error } = await supabaseAdmin
            .from('locations')
            .upsert(
                {
                    party_id,
                    google_place_id: googlePlaceId,
                    name: post.venue_name,
                    address: post.venue_address ?? null,
                    latitude: post.venue_latitude,
                    longitude: post.venue_longitude,
                    photo_url: post.image_url ?? null,
                    is_priority: true,
                },
                { onConflict: 'party_id,google_place_id' }
            )
            .select('id')
            .single();
        if (error || !location) throw new HttpError(500, 'add_location_failed', error?.message);

        res.json({ added: true, location_id: location.id });
    } catch (e) {
        next(e);
    }
});

export default router;
