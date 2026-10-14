import { Router } from 'express';
import { supabaseAdmin } from '../db';
import { rateLimit } from '../middleware/rateLimit';

const router = Router();

export const HEALTH_DB_LIMIT = 10;

router.get('/db', rateLimit(HEALTH_DB_LIMIT, 60_000), async (_req, res) => {
    const { error } = await supabaseAdmin.from('schools').select('id').limit(1);
    if (error) {
        console.error('[health/db]', error.message);
        return res.status(503).json({ ok: false });
    }
    res.json({ ok: true });
});

export default router;
