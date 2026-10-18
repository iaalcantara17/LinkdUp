import { Router } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../db';
import { requireAuth, AuthedRequest } from '../middleware/auth';
import { HttpError } from '../middleware/error';
import { rateLimit } from '../middleware/rateLimit';

const router = Router();

export const REPORT_REASONS = ['spam', 'harassment', 'inappropriate', 'other'] as const;
export const REPORT_IP_LIMIT = 60;
export const REPORT_USER_LIMIT = 10;
const HOUR = 60 * 60_000;

const reportSchema = z.object({
    reported_user_id: z.string().uuid(),
    reason: z.enum(REPORT_REASONS),
    details: z.string().trim().max(500).nullish(),
}).strict();

router.post(
    '/',
    rateLimit(REPORT_IP_LIMIT, HOUR),
    requireAuth,
    rateLimit(REPORT_USER_LIMIT, HOUR, (req) => (req as AuthedRequest).user?.id),
    async (req: AuthedRequest, res, next) => {
        try {
            const body = reportSchema.parse(req.body);
            const me = req.user!.id;
            const target = body.reported_user_id.toLowerCase();
            if (target === me.toLowerCase()) throw new HttpError(400, 'cannot_report_self');

            const { error } = await supabaseAdmin.from('reports').insert({
                reporter_id: me,
                reported_user_id: target,
                reason: body.reason,
                details: body.details || null,
            });
            if (error?.code === '23503') throw new HttpError(404, 'user_not_found');
            if (error && error.code !== '23505') throw new HttpError(500, 'report_failed', error.message);
            res.json({ ok: true });
        } catch (e) {
            next(e);
        }
    },
);

export default router;
