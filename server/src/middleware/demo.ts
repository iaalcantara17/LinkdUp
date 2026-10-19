import { Response, NextFunction } from 'express';
import type { AuthedRequest } from './auth';
import { supabaseAdmin } from '../db';
import { HttpError } from './error';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const ALLOWED_WRITES = new Set(['POST /api/auth/logout']);

export const BLOCKED_READS = new Set([
    '/api/calendar/oauth/start',
    '/api/discover/places/search',
    '/api/user/location/search',
]);

export function demoUserId(): string | null {
    const id = (process.env.DEMO_USER_ID ?? '').trim().toLowerCase();
    return UUID.test(id) ? id : null;
}

export function isDemoUser(id: string | undefined): boolean {
    const demo = demoUserId();
    return !!demo && !!id && id.toLowerCase() === demo;
}

export async function hiddenDemoUserIds(viewerId: string): Promise<Set<string>> {
    const demo = demoUserId();
    if (!demo || isDemoUser(viewerId)) return new Set();
    const { data, error } = await supabaseAdmin
        .from('user_follows')
        .select('followed_id')
        .eq('follower_id', demo);
    if (error) throw new HttpError(500, 'demo_lookup_failed', error.message);
    return new Set([demo, ...(data ?? []).map((f: any) => f.followed_id)]);
}

export function demoReadOnly(req: AuthedRequest, res: Response, next: NextFunction) {
    if (!isDemoUser(req.user?.id)) return next();
    const path = `${req.baseUrl}${req.path}`.toLowerCase().replace(/\/+$/, '');
    const read = req.method === 'GET' || req.method === 'HEAD';
    const allowed = read ? !BLOCKED_READS.has(path) : ALLOWED_WRITES.has(`${req.method} ${path}`);
    if (allowed) return next();
    res.status(403).json({ error: 'demo_read_only' });
}
