import { Router } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../db';
import { requireAuth, AuthedRequest } from '../middleware/auth';
import { HttpError } from '../middleware/error';
import { follow, unfollow } from '../services/follows';

const router = Router();

const uuid = z.string().uuid();
router.param('id', (_req, _res, next, id) => next(uuid.safeParse(id).success ? undefined : new HttpError(400, 'invalid_id')));

const requestSchema = z.object({ user_id: uuid });
router.post('/request', requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        const { user_id } = requestSchema.parse(req.body);
        await follow(req.user!.id, user_id);
        res.status(201).json({ ok: true, friendship_id: user_id });
    } catch (e) { next(e); }
});

router.post('/:id/accept', requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        const me = req.user!.id;
        const { data: old, error } = await supabaseAdmin
            .from('friendships')
            .select('requester_id, addressee_id')
            .eq('id', req.params.id)
            .maybeSingle();
        if (error) throw new HttpError(500, 'accept_failed', error.message);
        if (old && old.addressee_id !== me) throw new HttpError(403, 'not_addressee');
        await follow(me, old ? old.requester_id : req.params.id);
        res.json({ ok: true });
    } catch (e) { next(e); }
});

router.post('/:id/decline', requireAuth, (_req, res) => {
    res.json({ ok: true });
});

router.delete('/:id', requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        await unfollow(req.user!.id, req.params.id);
        res.json({ ok: true });
    } catch (e) { next(e); }
});

export default router;
