import { Router } from 'express';
import { z } from 'zod';
import { supabaseAdmin, supabaseSignIn } from '../db';
import { requireAuth, AuthedRequest } from '../middleware/auth';
import { HttpError } from '../middleware/error';
import { rateLimit } from '../middleware/rateLimit';
import { demoUserId, isDemoUser } from '../middleware/demo';
import { SELF_PROFILE_SELECT, profileDbError, toSelfProfile } from '../services/userProfile';

const router = Router();

const signupSchema = z.object({
    email: z.string().email(),
    password: z.string().min(8),
    display_name: z.string().min(1).max(100),
    school_id: z.string().uuid().optional(),
    graduation_year: z.number().int().min(1950).max(2100).optional(),
});

export const AUTH_LIMIT = 60;
export const LOGIN_LIMIT = 10;
const authLimit = rateLimit(AUTH_LIMIT, 60_000);

router.post('/signup', rateLimit(LOGIN_LIMIT, 15 * 60_000), async (req, res, next) => {
    try {
        const body = signupSchema.parse(req.body);

        let userId: string;
        const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
            email: body.email,
            password: body.password,
            email_confirm: true,
        });

        if (authErr) {
            const msg = authErr.message ?? '';
            const alreadyExists =
                msg.toLowerCase().includes('already registered') ||
                msg.toLowerCase().includes('already been registered') ||
                msg.toLowerCase().includes('user already exists');

            if (!alreadyExists) {
                throw new HttpError(400, 'signup_failed', msg || 'unknown');
            }

            // Prove ownership of the existing auth user before recovering the profile row.
            const { data: signInData, error: signInErr } = await supabaseSignIn(body.email, body.password);
            if (signInErr || !signInData?.user) {
                throw new HttpError(409, 'email_taken', 'Email is already registered. Use a different email or log in.');
            }
            userId = signInData.user.id;
        } else if (!authData?.user) {
            throw new HttpError(400, 'signup_failed', 'No user returned from auth provider');
        } else {
            userId = authData.user.id;
        }

        const { error: upsertErr } = await supabaseAdmin
            .from('users')
            .upsert(
                {
                    id: userId,
                    email: body.email,
                    display_name: body.display_name,
                    school_id: body.school_id ?? null,
                    graduation_year: body.graduation_year ?? null,
                },
                { onConflict: 'id' }
            );
        if (upsertErr) {
            if (authData?.user) {
                await supabaseAdmin.auth.admin.deleteUser(userId).catch(() => {});
            }
            throw new HttpError(500, 'profile_create_failed', upsertErr.message);
        }

        const { data: sessionData, error: sessionErr } = await supabaseSignIn(body.email, body.password);
        if (sessionErr || !sessionData?.session) {
            throw new HttpError(500, 'signin_after_signup_failed', sessionErr?.message);
        }

        res.status(201).json({
            user: { id: userId, email: body.email, display_name: body.display_name },
            session: {
                access_token: sessionData.session.access_token,
                refresh_token: sessionData.session.refresh_token,
                expires_at: sessionData.session.expires_at,
            },
        });
    } catch (e) {
        next(e);
    }
});

const loginSchema = z.object({
    email: z.string().email(),
    password: z.string(),
});

router.post('/login', rateLimit(LOGIN_LIMIT, 15 * 60_000), async (req, res, next) => {
    try {
        const body = loginSchema.parse(req.body);
        const { data, error } = await supabaseSignIn(body.email, body.password);
        if (error || !data.session) {
            throw new HttpError(401, 'invalid_credentials');
        }
        res.json({
            user: { id: data.user.id, email: data.user.email },
            session: {
                access_token: data.session.access_token,
                refresh_token: data.session.refresh_token,
                expires_at: data.session.expires_at,
            },
        });
    } catch (e) {
        next(e);
    }
});

export const DEMO_LIMIT = 10;

function demoCredentials() {
    const id = demoUserId();
    const email = process.env.DEMO_USER_EMAIL?.trim();
    const password = process.env.DEMO_USER_PASSWORD;
    return id && email && password ? { id, email, password } : null;
}

router.get('/demo-available', (_req, res) => {
    res.json({ available: demoCredentials() !== null });
});

router.post('/demo', rateLimit(DEMO_LIMIT, 15 * 60_000), async (_req, res, next) => {
    try {
        const demo = demoCredentials();
        if (!demo) throw new HttpError(404, 'not_found');

        let { data, error } = await supabaseSignIn(demo.email, demo.password);
        if (error || !data.session) {
            const { data: found } = await supabaseAdmin.auth.admin.getUserById(demo.id);
            if (found?.user?.email?.toLowerCase() !== demo.email.toLowerCase()) {
                throw new HttpError(500, 'demo_misconfigured');
            }
            const { error: resetErr } = await supabaseAdmin.auth.admin.updateUserById(demo.id, { password: demo.password });
            if (resetErr) throw new HttpError(503, 'demo_unavailable');
            ({ data, error } = await supabaseSignIn(demo.email, demo.password));
        }
        if (error || !data.session) throw new HttpError(503, 'demo_unavailable');
        if (data.user?.id !== demo.id) {
            await supabaseAdmin.auth.admin.signOut(data.session.access_token).catch(() => {});
            throw new HttpError(500, 'demo_misconfigured');
        }
        res.json({
            user: { id: demo.id },
            session: {
                access_token: data.session.access_token,
                refresh_token: data.session.refresh_token,
                expires_at: data.session.expires_at,
            },
        });
    } catch (e) {
        next(e);
    }
});

router.post('/logout', authLimit, requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        if (req.accessToken && !isDemoUser(req.user!.id)) {
            await supabaseAdmin.auth.admin.signOut(req.accessToken);
        }
        res.json({ ok: true });
    } catch (e) {
        next(e);
    }
});

const ensureProfileSchema = z.object({
    email:        z.string().email(),
    display_name: z.string().min(1).max(100),
});

router.post('/ensure-profile', authLimit, requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        const body = ensureProfileSchema.parse(req.body);
        const { data, error } = await supabaseAdmin
            .from('users')
            .upsert(
                {
                    id:           req.user!.id,
                    email:        body.email,
                    display_name: body.display_name,
                },
                { onConflict: 'id', ignoreDuplicates: false }
            )
            .select(SELF_PROFILE_SELECT)
            .single();
        if (error) {
            console.error('[ensure-profile] FAILED uid=%s email=%s error=%s', req.user!.id, body.email, error.message);
            throw profileDbError(error, new HttpError(500, 'ensure_profile_failed', error.message));
        }
        res.json(toSelfProfile(data));
    } catch (e) { next(e); }
});

router.get('/me', authLimit, requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        const { data, error } = await supabaseAdmin
            .from('users')
            .select(`${SELF_PROFILE_SELECT}, google_calendar_refresh`)
            .eq('id', req.user!.id)
            .single();
        if (error) throw profileDbError(error, new HttpError(404, 'profile_not_found'));
        const token = (data as any)?.google_calendar_refresh;
        const google_calendar_connected = token !== null && token !== undefined && String(token).trim() !== '';
        res.json({ ...toSelfProfile(data), google_calendar_connected, is_demo: isDemoUser(req.user!.id) });
    } catch (e) {
        next(e);
    }
});

export default router;
