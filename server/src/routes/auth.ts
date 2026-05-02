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
            const { data: signInData, error: signInErr } = await supabaseAdmin.auth.signInWithPassword({
                email: body.email,
                password: body.password,
            });
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

        const { data: sessionData, error: sessionErr } = await supabaseAdmin.auth.signInWithPassword({
            email: body.email,
            password: body.password,
        });
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

const ensureProfileSchema = z.object({
    email:        z.string().email(),
    display_name: z.string().min(1).max(100),
});

router.post('/ensure-profile', requireAuth, async (req: AuthedRequest, res, next) => {
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
            .select('id, email, display_name, graduation_year, school_id, avatar_color')
            .single();
        if (error) {
            console.error('[ensure-profile] FAILED uid=%s email=%s error=%s', req.user!.id, body.email, error.message);
            throw new HttpError(500, 'ensure_profile_failed', error.message);
        }
        res.json(data);
    } catch (e) { next(e); }
});

router.get('/me', requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        const { data, error } = await supabaseAdmin
            .from('users')
            .select('id, email, display_name, username, school_id, graduation_year, avatar_color, avatar_url, latitude, longitude, google_calendar_refresh, pronouns, birthday, bio, has_seen_walkthrough, location_permission_status')
            .eq('id', req.user!.id)
            .single();
        if (error) throw new HttpError(404, 'profile_not_found');
        const token = (data as any)?.google_calendar_refresh;
        const google_calendar_connected = token !== null && token !== undefined && String(token).trim() !== '';
        const { google_calendar_refresh: _omit, ...rest } = data as any;
        const age = (() => {
            if (!rest.birthday) return null;
            const d = new Date(rest.birthday);
            if (isNaN(d.getTime())) return null;
            return Math.floor((Date.now() - d.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
        })();
        res.json({ ...rest, google_calendar_connected, age });
    } catch (e) {
        next(e);
    }
});

export default router;
