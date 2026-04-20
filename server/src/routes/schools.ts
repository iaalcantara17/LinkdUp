import { Router } from 'express';
import { supabaseAdmin } from '../db';
import { requireAuth } from '../middleware/auth';

const router = Router();

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

export default router;
