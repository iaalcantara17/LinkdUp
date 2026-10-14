import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

export class HttpError extends Error {
    status: number;
    code: string;
    constructor(status: number, code: string, message?: string) {
        super(message ?? code);
        this.status = status;
        this.code = code;
    }
}

export const venueLimitReached = () => new HttpError(503, 'venue_limit_reached');

export function isGoogleQuotaError(err: any): boolean {
    const r = err?.response;
    const venueApi = /^https:\/\/(places|maps)\.googleapis\.com\//.test(String(err?.config?.url ?? ''));
    return venueApi && (r?.status === 429 || r?.data?.error?.status === 'RESOURCE_EXHAUSTED');
}

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
    console.error('\n[error]', err?.message || err);
    if (err?.stack) console.error(err.stack);
    if (err?.details) console.error('details:', err.details);
    if (err?.hint) console.error('hint:', err.hint);
    if (err?.code) console.error('code:', err.code);
    console.error('');

    if (err instanceof ZodError) {
        return res.status(400).json({ error: 'validation_error', issues: err.issues });
    }
    if (isGoogleQuotaError(err)) {
        return res.status(503).json({ error: 'venue_limit_reached' });
    }
    if (err instanceof HttpError) {
        return res.status(err.status).json(err.status >= 500 ? { error: err.code } : { error: err.code, message: err.message });
    }
    res.status(500).json({ error: 'server_error' });
}
