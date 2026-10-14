import { Request, Response, NextFunction } from 'express';

export function rateLimit(limit: number, windowMs: number) {
    const hits = new Map<string, { count: number; resetAt: number }>();
    return (req: Request, res: Response, next: NextFunction) => {
        const now = Date.now();
        const key = req.ip ?? 'unknown';
        let hit = hits.get(key);
        if (!hit || hit.resetAt <= now) {
            if (hits.size >= 10_000) hits.clear();
            hit = { count: 0, resetAt: now + windowMs };
            hits.set(key, hit);
        }
        hit.count += 1;
        if (hit.count > limit) {
            res.set('Retry-After', String(Math.ceil((hit.resetAt - now) / 1000)));
            return res.status(429).json({ error: 'rate_limited' });
        }
        next();
    };
}
