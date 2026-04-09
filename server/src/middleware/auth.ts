import { Request, Response, NextFunction } from 'express';
import { supabaseAsUser } from '../db';

export interface AuthedRequest extends Request {
    user?: { id: string; email: string };
    accessToken?: string;
}

export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
    const header = req.header('authorization') ?? req.header('Authorization');
    if (!header || !header.toLowerCase().startsWith('bearer ')) {
        return res.status(401).json({ error: 'missing_token' });
    }
    const token = header.slice(7).trim();
    if (!token) return res.status(401).json({ error: 'missing_token' });

    try {
        const sb = supabaseAsUser(token);
        const { data, error } = await sb.auth.getUser();
        if (error || !data.user) {
            return res.status(401).json({ error: 'invalid_token' });
        }
        req.user = { id: data.user.id, email: data.user.email ?? '' };
        req.accessToken = token;
        next();
    } catch (e) {
        return res.status(401).json({ error: 'auth_failed' });
    }
}
