import { Response, NextFunction } from 'express';
import { supabaseAdmin } from '../db';
import { AuthedRequest } from './auth';

const lastWriteMap = new Map<string, number>();
const THROTTLE_MS = 60_000;

export async function updateLastSeen(req: AuthedRequest, _res: Response, next: NextFunction) {
    const userId = req.user?.id;
    if (userId) {
        const now = Date.now();
        const last = lastWriteMap.get(userId) ?? 0;
        if (now - last > THROTTLE_MS) {
            lastWriteMap.set(userId, now);
            void supabaseAdmin
                .from('users')
                .update({ last_seen_at: new Date().toISOString() })
                .eq('id', userId)
                .then(() => {}, () => {});
        }
    }
    next();
}
