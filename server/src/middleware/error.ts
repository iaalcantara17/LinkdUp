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
    if (err instanceof HttpError) {
        return res.status(err.status).json({ error: err.code, message: err.message });
    }
    console.error('[unhandled]', err);
    res.status(500).json({ error: 'server_error', message: err?.message ?? 'unknown' });
}
