import { Router } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../db';
import { requireAuth, AuthedRequest } from '../middleware/auth';
import { hiddenDemoUserIds } from '../middleware/demo';
import { HttpError } from '../middleware/error';
import { followFlags, followingIds, friendIds, legacyFriendship, unfollow } from '../services/follows';

const router = Router();

router.param('user_id', (_req, _res, next, id) => next(z.string().uuid().safeParse(id).success ? undefined : new HttpError(400, 'invalid_id')));

async function publicUserFields(userId: string) {
    const { data } = await supabaseAdmin
        .from('users')
        .select('id, display_name, username, avatar_url, avatar_color, pronouns, school_id, graduation_year')
        .eq('id', userId)
        .single();
    return data;
}

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

router.get('/outgoing', requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        const me = req.user!.id;
        const { data, error } = await supabaseAdmin
            .from('friendships')
            .select('id, addressee_id, requested_at')
            .eq('requester_id', me)
            .eq('status', 'pending');
        if (error) throw error;

        const addresseeIds = (data ?? []).map((f: any) => f.addressee_id);
        const { data: users } = addresseeIds.length > 0
            ? await supabaseAdmin
                .from('users')
                .select('id, display_name, username, avatar_url, avatar_color')
                .in('id', addresseeIds)
            : { data: [] as any[] };

        const userMap = Object.fromEntries((users ?? []).map((u: any) => [u.id, u]));
        res.json((data ?? []).map((f: any) => ({
            friendship_id: f.id,
            requested_at: f.requested_at,
            user: userMap[f.addressee_id] ?? null,
        })));
    } catch (e) { next(e); }
});

const requestSchema = z.object({ user_id: z.string().uuid() });
router.post('/request', requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        const { user_id } = requestSchema.parse(req.body);
        const me = req.user!.id;
        if (user_id === me) throw new HttpError(400, 'cannot_friend_self');

        const { data: blockCheck } = await supabaseAdmin
            .from('user_blocks')
            .select('blocker_id')
            .or(`and(blocker_id.eq.${me},blocked_id.eq.${user_id}),and(blocker_id.eq.${user_id},blocked_id.eq.${me})`)
            .limit(1);
        if ((blockCheck ?? []).length > 0) throw new HttpError(403, 'blocked');

        const { data: existing } = await supabaseAdmin
            .from('friendships')
            .select('id, status')
            .or(
                `and(requester_id.eq.${me},addressee_id.eq.${user_id}),and(requester_id.eq.${user_id},addressee_id.eq.${me})`
            )
            .maybeSingle();

        if (existing) throw new HttpError(409, 'request_already_exists');

        const { data, error } = await supabaseAdmin
            .from('friendships')
            .insert({ requester_id: me, addressee_id: user_id, status: 'pending' })
            .select('id')
            .single();
        if (error) throw new HttpError(500, 'request_failed', error.message);

        res.status(201).json({ ok: true, friendship_id: data.id });
    } catch (e) { next(e); }
});

router.post('/:id/accept', requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        const friendshipId = req.params.id;
        const me = req.user!.id;

        const { data: row } = await supabaseAdmin
            .from('friendships')
            .select('id, addressee_id, status')
            .eq('id', friendshipId)
            .single();
        if (!row) throw new HttpError(404, 'not_found');
        if (row.addressee_id !== me) throw new HttpError(403, 'not_addressee');
        if (row.status !== 'pending') throw new HttpError(409, 'not_pending');

        await supabaseAdmin
            .from('friendships')
            .update({ status: 'accepted', responded_at: new Date().toISOString() })
            .eq('id', friendshipId);

        res.json({ ok: true });
    } catch (e) { next(e); }
});

router.post('/:id/decline', requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        const friendshipId = req.params.id;
        const me = req.user!.id;

        const { data: row } = await supabaseAdmin
            .from('friendships')
            .select('id, addressee_id')
            .eq('id', friendshipId)
            .single();
        if (!row) throw new HttpError(404, 'not_found');
        if (row.addressee_id !== me) throw new HttpError(403, 'not_addressee');

        await supabaseAdmin.from('friendships').delete().eq('id', friendshipId);
        res.json({ ok: true });
    } catch (e) { next(e); }
});

router.delete('/:user_id', requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        await unfollow(req.user!.id, req.params.user_id);
        res.json({ ok: true });
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
