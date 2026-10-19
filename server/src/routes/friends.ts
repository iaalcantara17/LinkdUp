import { Router } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../db';
import { requireAuth, AuthedRequest } from '../middleware/auth';
import { hiddenDemoUserIds } from '../middleware/demo';
import { HttpError } from '../middleware/error';
import { followFlags, followingIds, friendIds, legacyFriendship } from '../services/follows';

const router = Router();

router.param('user_id', (_req, _res, next, id) => next(z.string().uuid().safeParse(id).success ? undefined : new HttpError(400, 'invalid_id')));

router.get('/', requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        const me = req.user!.id;
        const [mutual, hidden] = await Promise.all([friendIds(me), hiddenDemoUserIds(me)]);
        const ids = [...mutual].filter((id) => !hidden.has(id));
        if (ids.length === 0) return res.json([]);

        const { data: users } = await supabaseAdmin
            .from('users')
            .select('id, display_name, username, avatar_url, avatar_color, pronouns, school_id, graduation_year, last_seen_at')
            .in('id', ids);

        const onlineCutoff = new Date(Date.now() - 5 * 60 * 1000);
        res.json((users ?? []).map((u: any) => ({
            ...u,
            is_online: u.last_seen_at ? new Date(u.last_seen_at) > onlineCutoff : false,
        })));
    } catch (e) { next(e); }
});

router.get('/pending', requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        const me = req.user!.id;
        const [{ data, error }, following, hidden] = await Promise.all([
            supabaseAdmin
                .from('user_follows')
                .select('follower_id, followed_at')
                .eq('followed_id', me)
                .order('followed_at', { ascending: false })
                .limit(100),
            followingIds(me),
            hiddenDemoUserIds(me),
        ]);
        if (error) throw error;

        const mine = new Set(following);
        const rows = (data ?? []).filter((f: any) => !mine.has(f.follower_id) && !hidden.has(f.follower_id));
        const followerIds = rows.map((f: any) => f.follower_id);
        const { data: users } = followerIds.length > 0
            ? await supabaseAdmin
                .from('users')
                .select('id, display_name, username, avatar_url, avatar_color')
                .in('id', followerIds)
            : { data: [] as any[] };

        const userMap = Object.fromEntries((users ?? []).map((u: any) => [u.id, u]));
        res.json(rows.map((f: any) => ({
            friendship_id: f.follower_id,
            requested_at: f.followed_at,
            user: userMap[f.follower_id] ?? null,
        })));
    } catch (e) { next(e); }
});

router.get('/search', requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        const q = ((req.query.q as string) ?? '').trim();
        if (!q) return res.json([]);

        const me = req.user!.id;
        const isUsernameSearch = q.startsWith('@');
        const searchTerm = isUsernameSearch ? q.slice(1) : q;
        const safe = searchTerm.replace(/[^A-Za-z0-9 _.@+-]/g, '').trim().slice(0, 64);
        if (!safe) return res.json([]);

        const orCondition = isUsernameSearch
            ? `username.ilike.%${safe}%`
            : `display_name.ilike.%${safe}%,email.ilike.%${safe}%,username.ilike.%${safe}%`;

        const { data: found, error } = await supabaseAdmin
            .from('users')
            .select('id, display_name, username, avatar_url, avatar_color')
            .or(orCondition)
            .neq('id', me)
            .limit(20);
        if (error) throw error;
        const hidden = await hiddenDemoUserIds(me);
        const users = (found ?? []).filter((u: any) => !hidden.has(u.id));
        if (users.length === 0) return res.json([]);

        const flags = await followFlags(me, users.map((u: any) => u.id));
        res.json(users.map((u: any) => ({
            ...u,
            ...flags(u.id),
            friendship: legacyFriendship(u.id, flags(u.id)),
        })));
    } catch (e) { next(e); }
});

router.get('/status/:user_id', requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        const me = req.user!.id;
        const other = req.params.user_id;
        if (other === me) return res.json({ status: 'self' });

        const f = (await followFlags(me, [other]))(other);
        res.json({ ...(legacyFriendship(other, f) ?? { status: 'none' }), ...f });
    } catch (e) { next(e); }
});

export default router;
