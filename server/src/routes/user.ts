import { Router } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../db';
import { requireAuth, AuthedRequest } from '../middleware/auth';
import { HttpError } from '../middleware/error';
import { geocodeCity } from '../services/places';

const router = Router();

router.get('/me', requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        const { data, error } = await supabaseAdmin
            .from('users')
            .select('id, email, display_name, school_id, graduation_year, avatar_color, latitude, longitude, last_location_at')
            .eq('id', req.user!.id)
            .single();
        if (error) throw new HttpError(404, 'profile_not_found');
        res.json(data);
    } catch (e) { next(e); }
});

const patchSchema = z.object({
    display_name: z.string().min(1).max(100).optional(),
    avatar_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

router.patch('/me', requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        const body = patchSchema.parse(req.body);
        const { data, error } = await supabaseAdmin
            .from('users')
            .update({ ...body, updated_at: new Date().toISOString() })
            .eq('id', req.user!.id)
            .select()
            .single();
        if (error) throw new HttpError(500, 'update_failed', error.message);
        res.json(data);
    } catch (e) { next(e); }
});

const locationSchema = z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
});

router.put('/location', requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        const body = locationSchema.parse(req.body);
        const { error } = await supabaseAdmin
            .from('users')
            .update({
                latitude: body.latitude,
                longitude: body.longitude,
                last_location_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            })
            .eq('id', req.user!.id);
        if (error) throw new HttpError(500, 'update_failed', error.message);
        res.json({ ok: true });
    } catch (e) { next(e); }
});

const manualSchema = z.object({ city: z.string().min(1), country: z.string().optional() });

router.put('/location/manual', requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        const body = manualSchema.parse(req.body);
        const coords = await geocodeCity(body.city, body.country);
        if (!coords) throw new HttpError(404, 'city_not_found');
        const { error } = await supabaseAdmin
            .from('users')
            .update({
                latitude: coords.latitude,
                longitude: coords.longitude,
                last_location_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            })
            .eq('id', req.user!.id);
        if (error) throw new HttpError(500, 'update_failed', error.message);
        res.json({ ok: true, ...coords });
    } catch (e) { next(e); }
});

export default router;
