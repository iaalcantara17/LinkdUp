import { Router } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../db';
import { requireAuth } from '../middleware/auth';
import { HttpError } from '../middleware/error';

const router = Router();

const lookupSchema = z.object({ name: z.string().min(1).max(200) });

router.post('/lookup', async (req, res, next) => {
    try {
        const { name } = lookupSchema.parse(req.body);

        const { data: existing } = await supabaseAdmin
            .from('schools')
            .select('id, name, city, state')
            .ilike('name', name.trim())
            .limit(1)
            .maybeSingle();

        if (existing) return res.json(existing);

        const { data: created, error } = await supabaseAdmin
            .from('schools')
            .insert({ name: name.trim() })
            .select('id, name, city, state')
            .single();
        if (error || !created) throw new HttpError(500, 'school_create_failed', error?.message);

        res.status(201).json(created);
    } catch (e) {
        next(e);
    }
});

router.get('/', requireAuth, async (req, res, next) => {
    try {
        const q = (req.query.q as string ?? '').trim();
        let query = supabaseAdmin.from('schools').select('id, name, city, state').order('name').limit(20);
        if (q.length > 0) query = query.ilike('name', `%${q}%`);
        const { data, error } = await query;
        if (error) throw error;
        res.json(data ?? []);
    } catch (e) {
        next(e);
    }
});

router.get('/:id', requireAuth, async (req, res, next) => {
    try {
        const { data, error } = await supabaseAdmin
            .from('schools')
            .select('id, name, city, state')
            .eq('id', req.params.id)
            .single();
        if (error || !data) throw new HttpError(404, 'school_not_found');
        res.json(data);
    } catch (e) {
        next(e);
    }
});

export default router;
