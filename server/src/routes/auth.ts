import { Router } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../db';
import { requireAuth, AuthedRequest } from '../middleware/auth';
import { HttpError } from '../middleware/error';

const router = Router();

const signupSchema = z.object({
    email: z.string().email(),
    password: z.string().min(8),
    display_name: z.string().min(1).max(100),
    school_id: z.string().uuid().optional(),
    graduation_year: z.number().int().min(1950).max(2100).optional(),
});

router.post('/signup', async (req, res, next) => {
    try {
        const body = signupSchema.parse(req.body);

        // Create the auth user via admin API
        const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
            email: body.email,
            password: body.password,
            email_confirm: true,
        });
        if (authErr || !authData.user) {
            throw new HttpError(400, 'signup_failed', authErr?.message ?? 'unknown');
        }

        // Insert into our users table
        const { error: userErr } = await supabaseAdmin.from('users').insert({
            id: authData.user.id,
            email: body.email,
            display_name: body.display_name,
            school_id: body.school_id ?? null,
            graduation_year: body.graduation_year ?? null,
        });
        if (userErr) {
            // Rollback the auth user
            await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
            throw new HttpError(500, 'profile_create_failed', userErr.message);
        }

        // Sign in immediately to return a session
        const { data: sessionData, error: signInErr } = await supabaseAdmin.auth.signInWithPassword({
            email: body.email,
            password: body.password,
        });
        if (signInErr || !sessionData.session) {
            throw new HttpError(500, 'signin_after_signup_failed', signInErr?.message);
        }

        res.status(201).json({
            user: { id: authData.user.id, email: body.email, display_name: body.display_name },
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

router.post('/login', async (req, res, next) => {
    try {
        const body = loginSchema.parse(req.body);
        const { data, error } = await supabaseAdmin.auth.signInWithPassword({
            email: body.email,
            password: body.password,
        });
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

router.post('/logout', requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        if (req.accessToken) {
            await supabaseAdmin.auth.admin.signOut(req.accessToken);
        }
        res.json({ ok: true });
    } catch (e) {
        next(e);
    }
});

router.get('/me', requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        const { data, error } = await supabaseAdmin
            .from('users')
            .select('id, email, display_name, school_id, graduation_year, avatar_color')
            .eq('id', req.user!.id)
            .single();
        if (error) throw new HttpError(404, 'profile_not_found');
        res.json(data);
    } catch (e) {
        next(e);
    }
});

export default router;
