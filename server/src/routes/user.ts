import { Router } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../db';
import { requireAuth, AuthedRequest } from '../middleware/auth';
import { HttpError } from '../middleware/error';
import { geocodeCity } from '../services/places';

const router = Router();

function computeAge(birthday: string | null | undefined): number | null {
    if (!birthday) return null;
    const today = new Date();
    const bday = new Date(birthday);
    if (isNaN(bday.getTime())) return null;
    const age = Math.floor((today.getTime() - bday.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
    return age >= 0 ? age : null;
}

router.get('/me', requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        const { data, error } = await supabaseAdmin
            .from('users')
            .select('id, email, display_name, school_id, graduation_year, avatar_color, avatar_url, latitude, longitude, last_location_at, pronouns, birthday, bio')
            .eq('id', req.user!.id)
            .single();
        if (error) throw new HttpError(404, 'profile_not_found');
        res.json({ ...data, age: computeAge(data.birthday) });
    } catch (e) { next(e); }
});

const patchSchema = z.object({
    display_name:    z.string().min(1).max(100).optional(),
    avatar_color:    z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    graduation_year: z.number().int().min(1950).max(2100).nullable().optional(),
    school_id:       z.string().uuid().nullable().optional(),
    pronouns:        z.preprocess(
        (v) => (v === '' ? null : v),
        z.string().max(50).nullable().optional(),
    ),
    birthday:        z.preprocess(
        (v) => (v === '' ? null : v),
        z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional().refine((val) => {
            if (!val) return true;
            const d = new Date(val);
            if (isNaN(d.getTime())) return false;
            const today = new Date();
            const age = (today.getTime() - d.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
            return age >= 13 && d < today;
        }, { message: 'birthday_invalid_or_under_13' }),
    ),
    bio:             z.preprocess(
        (v) => (v === '' ? null : v),
        z.string().max(200).nullable().optional(),
    ),
});

router.patch('/me', requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        console.log('[PATCH /me] body received:', req.body);
        const body = patchSchema.parse(req.body);
        const updateObj = { ...body, updated_at: new Date().toISOString() };
        console.log('[PATCH /me] update object:', updateObj);
        const { data, error } = await supabaseAdmin
            .from('users')
            .update(updateObj)
            .eq('id', req.user!.id)
            .select()
            .single();
        console.log('[PATCH /me] result:', { data: data ? { id: data.id, pronouns: data.pronouns, bio: data.bio, birthday: data.birthday } : null, error });
        if (error) {
            throw new HttpError(500, 'update_failed', error.message);
        }
        res.json({ ...data, age: computeAge(data.birthday) });
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

const avatarSchema = z.object({
    image_base64: z.string().min(1),
});

router.put('/me/avatar', requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        const body = avatarSchema.parse(req.body);
        const buffer = Buffer.from(body.image_base64, 'base64');
        const path = `${req.user!.id}.jpg`;

        const { error: uploadErr } = await supabaseAdmin.storage
            .from('avatars')
            .upload(path, buffer, { contentType: 'image/jpeg', upsert: true });
        if (uploadErr) throw new HttpError(500, 'avatar_upload_failed', uploadErr.message);

        const { data: urlData } = supabaseAdmin.storage.from('avatars').getPublicUrl(path);
        const avatar_url = urlData.publicUrl;

        const { error: updateErr } = await supabaseAdmin
            .from('users')
            .update({ avatar_url, updated_at: new Date().toISOString() })
            .eq('id', req.user!.id);
        if (updateErr) throw new HttpError(500, 'avatar_update_failed', updateErr.message);

        res.json({ ok: true, avatar_url });
    } catch (e) { next(e); }
});

// GET /api/user/:id/public — public-safe profile for viewing another user's profile.
// Returns only non-sensitive fields; omits email, location, and auth tokens.
router.get('/:id/public', requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        const { data, error } = await supabaseAdmin
            .from('users')
            .select('id, display_name, avatar_url, avatar_color, school_id, graduation_year, pronouns, birthday, bio')
            .eq('id', req.params.id)
            .single();
        if (error || !data) throw new HttpError(404, 'user_not_found');

        let school: string | null = null;
        if (data.school_id) {
            const { data: s } = await supabaseAdmin
                .from('schools')
                .select('name')
                .eq('id', data.school_id)
                .single();
            school = s?.name ?? null;
        }

        res.json({
            id: data.id,
            display_name: data.display_name,
            avatar_url: data.avatar_url,
            avatar_color: data.avatar_color,
            school,
            graduation_year: data.graduation_year,
            pronouns: data.pronouns ?? null,
            age: computeAge(data.birthday),
            bio: data.bio ?? null,
        });
    } catch (e) { next(e); }
});

// GET /api/user/me/parties - parties the current user is a member of, newest first
// Uses two sequential queries instead of a PostgREST embedded join to avoid
// schema-cache issues and ambiguous FK resolution on fresh Supabase projects.
router.get('/me/parties', requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        const { data: memberships, error: memberErr } = await supabaseAdmin
            .from('party_members')
            .select('party_id')
            .eq('user_id', req.user!.id);
        if (memberErr) throw new HttpError(500, 'memberships_query_failed', memberErr.message);

        const partyIds = (memberships ?? []).map((m: any) => m.party_id).filter(Boolean);
        if (partyIds.length === 0) return res.json([]);

        const { data: parties, error: partyErr } = await supabaseAdmin
            .from('parties')
            .select('id, name, code, status, host_user_id, created_at, updated_at, matched_location_id')
            .in('id', partyIds)
            .order('updated_at', { ascending: false });
        if (partyErr) throw new HttpError(500, 'parties_query_failed', partyErr.message);

        res.json(parties ?? []);
    } catch (e) { next(e); }
});

// GET /api/user/me/hangouts - upcoming hangouts (matched/scheduled/locked parties)
// enriched with venue, locked date, and member count; sorted soonest-first.
router.get('/me/hangouts', requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        // 1. Party IDs where this user is a member
        const { data: memberships, error: memberErr } = await supabaseAdmin
            .from('party_members')
            .select('party_id')
            .eq('user_id', req.user!.id);
        if (memberErr) throw new HttpError(500, 'memberships_query_failed', memberErr.message);

        const partyIds = (memberships ?? []).map((m: any) => m.party_id).filter(Boolean);
        if (partyIds.length === 0) return res.json([]);

        // 2. Parties with upcoming statuses
        const { data: parties, error: partyErr } = await supabaseAdmin
            .from('parties')
            .select('id, name, code, status, host_user_id, matched_location_id, locked_date_id')
            .in('id', partyIds)
            .in('status', ['matched', 'scheduled', 'locked']);
        if (partyErr) throw new HttpError(500, 'parties_query_failed', partyErr.message);
        if (!parties || parties.length === 0) return res.json([]);

        // 3. Collect referenced IDs
        const locationIds = [...new Set(parties.map((p: any) => p.matched_location_id).filter(Boolean))];
        const dateIds     = [...new Set(parties.map((p: any) => p.locked_date_id).filter(Boolean))];
        const allPartyIds = parties.map((p: any) => p.id);

        // 4. Venues, locked dates, and member rows — three parallel fetches
        const [venueRes, dateRes, memberRes] = await Promise.all([
            locationIds.length > 0
                ? supabaseAdmin.from('locations').select('id, name, address, latitude, longitude').in('id', locationIds)
                : Promise.resolve({ data: [] as any[] }),
            dateIds.length > 0
                ? supabaseAdmin.from('party_dates').select('id, starts_at, ends_at').in('id', dateIds)
                : Promise.resolve({ data: [] as any[] }),
            supabaseAdmin.from('party_members').select('party_id').in('party_id', allPartyIds),
        ]);

        // 5. Build lookup maps
        const locationMap: Record<string, any> = Object.fromEntries((venueRes.data ?? []).map((l: any) => [l.id, l]));
        const dateMap: Record<string, any>     = Object.fromEntries((dateRes.data ?? []).map((d: any) => [d.id, d]));
        const countMap: Record<string, number> = {};
        for (const row of memberRes.data ?? []) {
            countMap[row.party_id] = (countMap[row.party_id] ?? 0) + 1;
        }

        // 6. Assemble
        const hangouts = parties.map((p: any) => ({
            id:            p.id,
            name:          p.name,
            code:          p.code,
            status:        p.status,
            host_user_id:  p.host_user_id,
            venue:         p.matched_location_id ? (locationMap[p.matched_location_id] ?? null) : null,
            locked_date:   p.locked_date_id      ? (dateMap[p.locked_date_id]           ?? null) : null,
            member_count:  countMap[p.id] ?? 0,
        }));

        // 7. Sort: dated hangouts ascending, undated ones at the end
        hangouts.sort((a: any, b: any) => {
            if (a.locked_date && b.locked_date) {
                return new Date(a.locked_date.starts_at).getTime() - new Date(b.locked_date.starts_at).getTime();
            }
            if (a.locked_date) return -1;
            if (b.locked_date) return 1;
            return 0;
        });

        res.json(hangouts);
    } catch (e) { next(e); }
});

// DELETE /api/user/me — permanently remove the authenticated user's account.
// Deletes hosted parties (cascade via FKs or manual ordered deletes), cleans up
// membership rows, removes the profile row, then deletes the auth record.
// Partial failures are logged but do not abort the remaining steps.
router.delete('/me', requireAuth, async (req: AuthedRequest, res, next) => {
    const userId = req.user!.id;
    const errors: string[] = [];

    try {
        // 1. Find all parties this user hosts
        const { data: hostedParties } = await supabaseAdmin
            .from('parties')
            .select('id')
            .eq('host_user_id', userId);

        const hostedIds = (hostedParties ?? []).map((p: any) => p.id);

        if (hostedIds.length > 0) {
            // 1a. Delete date_votes for all dates of hosted parties
            try {
                const { data: pDates } = await supabaseAdmin
                    .from('party_dates').select('id').in('party_id', hostedIds);
                const dateIds = (pDates ?? []).map((d: any) => d.id);
                if (dateIds.length > 0) {
                    await supabaseAdmin.from('date_votes').delete().in('party_date_id', dateIds);
                }
            } catch (e: any) { errors.push(`date_votes: ${e.message}`); }

            // 1b. party_dates
            try {
                await supabaseAdmin.from('party_dates').delete().in('party_id', hostedIds);
            } catch (e: any) { errors.push(`party_dates: ${e.message}`); }

            // 1c. votes
            try {
                await supabaseAdmin.from('votes').delete().in('party_id', hostedIds);
            } catch (e: any) { errors.push(`votes: ${e.message}`); }

            // 1d. locations
            try {
                await supabaseAdmin.from('locations').delete().in('party_id', hostedIds);
            } catch (e: any) { errors.push(`locations: ${e.message}`); }

            // 1e. party_members (all members of hosted parties)
            try {
                await supabaseAdmin.from('party_members').delete().in('party_id', hostedIds);
            } catch (e: any) { errors.push(`party_members_hosted: ${e.message}`); }

            // 1f. the parties themselves
            try {
                await supabaseAdmin.from('parties').delete().in('id', hostedIds);
            } catch (e: any) { errors.push(`parties: ${e.message}`); }
        }

        // 2. Remove user from any remaining parties they joined (but didn't host)
        try {
            await supabaseAdmin.from('party_members').delete().eq('user_id', userId);
        } catch (e: any) { errors.push(`party_members_member: ${e.message}`); }

        // 3. Delete user profile row
        try {
            await supabaseAdmin.from('users').delete().eq('id', userId);
        } catch (e: any) { errors.push(`users: ${e.message}`); }

        // 4. Delete the Supabase auth record (must be last — loses the token)
        try {
            const { error: authErr } = await supabaseAdmin.auth.admin.deleteUser(userId);
            if (authErr) errors.push(`auth: ${authErr.message}`);
        } catch (e: any) { errors.push(`auth: ${e.message}`); }

        if (errors.length > 0) {
            console.error('[delete-account] partial failures for', userId, errors);
        }

        res.json({ ok: true });
    } catch (e) { next(e); }
});

export default router;
