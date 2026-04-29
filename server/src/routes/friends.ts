import { Router } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../db';
import { requireAuth, AuthedRequest } from '../middleware/auth';
import { HttpError } from '../middleware/error';

const router = Router();

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
        const { data, error } = await supabaseAdmin
            .from('friendships')
            .select('id, requester_id, addressee_id, requested_at, responded_at')
            .eq('status', 'accepted')
            .or(`requester_id.eq.${me},addressee_id.eq.${me}`);
        if (error) throw error;

        const friendIds = (data ?? []).map((f: any) =>
            f.requester_id === me ? f.addressee_id : f.requester_id
        );
        if (friendIds.length === 0) return res.json([]);

        const { data: users } = await supabaseAdmin
            .from('users')
            .select('id, display_name, username, avatar_url, avatar_color, pronouns, school_id, graduation_year, last_seen_at')
            .in('id', friendIds);

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
        const { data, error } = await supabaseAdmin
            .from('friendships')
            .select('id, requester_id, requested_at')
            .eq('addressee_id', me)
            .eq('status', 'pending');
        if (error) throw error;

        const requesterIds = (data ?? []).map((f: any) => f.requester_id);
        const { data: users } = requesterIds.length > 0
            ? await supabaseAdmin
                .from('users')
                .select('id, display_name, username, avatar_url, avatar_color')
                .in('id', requesterIds)
            : { data: [] as any[] };

        const userMap = Object.fromEntries((users ?? []).map((u: any) => [u.id, u]));
        res.json((data ?? []).map((f: any) => ({
            friendship_id: f.id,
            requested_at: f.requested_at,
            user: userMap[f.requester_id] ?? null,
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
        const other = req.params.user_id;
        const me = req.user!.id;

        await supabaseAdmin
            .from('friendships')
            .delete()
            .or(
                `and(requester_id.eq.${me},addressee_id.eq.${other}),and(requester_id.eq.${other},addressee_id.eq.${me})`
            );

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
        const safe = searchTerm.replace(/%/g, '').slice(0, 64);
        if (!safe) return res.json([]);

        const orCondition = isUsernameSearch
            ? `username.ilike.%${safe}%`
            : `display_name.ilike.%${safe}%,email.ilike.%${safe}%,username.ilike.%${safe}%`;

        const { data: users, error } = await supabaseAdmin
            .from('users')
            .select('id, display_name, username, avatar_url, avatar_color')
            .or(orCondition)
            .neq('id', me)
            .limit(20);
        if (error) throw error;
        if (!users || users.length === 0) return res.json([]);

        const userIds = users.map((u: any) => u.id);

        const { data: friendships } = await supabaseAdmin
            .from('friendships')
            .select('id, requester_id, addressee_id, status')
            .or(
                userIds.map((id: string) =>
                    `and(requester_id.eq.${me},addressee_id.eq.${id}),and(requester_id.eq.${id},addressee_id.eq.${me})`
                ).join(',')
            );

        const fMap: Record<string, { friendship_id: string; status: string; direction: 'outgoing' | 'incoming' }> = {};
        for (const f of friendships ?? []) {
            const otherId = f.requester_id === me ? f.addressee_id : f.requester_id;
            fMap[otherId] = {
                friendship_id: f.id,
                status: f.status,
                direction: f.requester_id === me ? 'outgoing' : 'incoming',
            };
        }

        res.json(users.map((u: any) => ({
            ...u,
            friendship: fMap[u.id] ?? null,
        })));
    } catch (e) { next(e); }
});

router.get('/status/:user_id', requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        const me = req.user!.id;
        const other = req.params.user_id;
        if (other === me) return res.json({ status: 'self' });

        const { data: row } = await supabaseAdmin
            .from('friendships')
            .select('id, requester_id, addressee_id, status')
            .or(
                `and(requester_id.eq.${me},addressee_id.eq.${other}),and(requester_id.eq.${other},addressee_id.eq.${me})`
            )
            .maybeSingle();

        if (!row) return res.json({ status: 'none' });

        res.json({
            friendship_id: row.id,
            status: row.status,
            direction: row.requester_id === me ? 'outgoing' : 'incoming',
        });
    } catch (e) { next(e); }
});

export default router;
