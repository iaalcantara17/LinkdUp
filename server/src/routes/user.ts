import { Router } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../db';
import { requireAuth, AuthedRequest } from '../middleware/auth';
import { HttpError } from '../middleware/error';
import { geocodeCity } from '../services/places';
import { deleteCalendarEventForUser } from '../services/googleCalendar';

const router = Router();

const RESERVED_USERNAMES = ['admin', 'support', 'linkdup', 'system', 'root', 'help', 'api'];

function validateUsername(u: string): { valid: boolean; reason?: string } {
    if (u.length < 3)  return { valid: false, reason: 'too_short' };
    if (u.length > 20) return { valid: false, reason: 'too_long' };
    if (!/^[a-z0-9_]+$/.test(u)) return { valid: false, reason: 'invalid_chars' };
    if (!/^[a-z]/.test(u))        return { valid: false, reason: 'starts_with_number' };
    if (RESERVED_USERNAMES.includes(u)) return { valid: false, reason: 'reserved' };
    return { valid: true };
}

function computeAge(birthday: string | null | undefined): number | null {
    if (!birthday) return null;
    const today = new Date();
    const bday = new Date(birthday);
    if (isNaN(bday.getTime())) return null;
    const age = Math.floor((today.getTime() - bday.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
    return age >= 0 ? age : null;
}

async function isEitherBlocked(a: string, b: string): Promise<boolean> {
    const { data } = await supabaseAdmin
        .from('user_blocks')
        .select('blocker_id')
        .or(`and(blocker_id.eq.${a},blocked_id.eq.${b}),and(blocker_id.eq.${b},blocked_id.eq.${a})`)
        .limit(1);
    return (data ?? []).length > 0;
}

router.get('/me', requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        const { data, error } = await supabaseAdmin
            .from('users')
            .select('id, email, display_name, username, school_id, graduation_year, avatar_color, avatar_url, latitude, longitude, last_location_at, pronouns, birthday, bio, theme_preference')
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
    username: z.preprocess(
        (v) => (typeof v === 'string' ? v.toLowerCase().trim() : v),
        z.string()
            .min(3, { message: 'too_short' })
            .max(20, { message: 'too_long' })
            .regex(/^[a-z][a-z0-9_]+$/, { message: 'invalid_chars' })
            .refine(u => !RESERVED_USERNAMES.includes(u), { message: 'reserved' })
            .optional()
    ),
    theme_preference: z.enum(['dark', 'light', 'system']).optional(),
});

router.patch('/me', requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        const body = patchSchema.parse(req.body);
        const updateObj = { ...body, updated_at: new Date().toISOString() };
        const { data, error } = await supabaseAdmin
            .from('users')
            .update(updateObj)
            .eq('id', req.user!.id)
            .select()
            .single();
        if (error) {
            if (error.code === '23505') throw new HttpError(409, 'username_taken');
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
        const { data: existing } = await supabaseAdmin
            .from('users')
            .select('location_permission_status')
            .eq('id', req.user!.id)
            .single();
        const updatePayload: Record<string, any> = {
            latitude: body.latitude,
            longitude: body.longitude,
            last_location_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };
        if (existing?.location_permission_status !== 'granted') {
            updatePayload.location_permission_status = 'granted';
        }
        const { error } = await supabaseAdmin
            .from('users')
            .update(updatePayload)
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

router.get('/me/parties', requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        const { data: memberships, error: memberErr } = await supabaseAdmin
            .from('party_members')
            .select('party_id')
            .eq('user_id', req.user!.id);
        if (memberErr) throw new HttpError(500, 'memberships_query_failed', memberErr.message);

        const partyIds = (memberships ?? []).map((m: any) => m.party_id).filter(Boolean);
        if (partyIds.length === 0) return res.json([]);

        const [partiesRes, allMembersRes, votesRes, locationsRes] = await Promise.all([
            supabaseAdmin
                .from('parties')
                .select('id, name, code, status, host_user_id, created_at, updated_at, matched_location_id')
                .in('id', partyIds)
                .order('updated_at', { ascending: false }),
            supabaseAdmin.from('party_members').select('party_id, user_id').in('party_id', partyIds),
            supabaseAdmin.from('votes').select('party_id').in('party_id', partyIds),
            supabaseAdmin.from('locations').select('party_id').in('party_id', partyIds),
        ]);
        if (partiesRes.error) throw new HttpError(500, 'parties_query_failed', partiesRes.error.message);

        const parties = partiesRes.data ?? [];
        if (parties.length === 0) return res.json([]);

        const memberMap: Record<string, string[]> = {};
        for (const m of allMembersRes.data ?? []) {
            if (!memberMap[m.party_id]) memberMap[m.party_id] = [];
            memberMap[m.party_id].push(m.user_id);
        }
        const voteCountMap: Record<string, number> = {};
        for (const v of votesRes.data ?? []) voteCountMap[v.party_id] = (voteCountMap[v.party_id] ?? 0) + 1;
        const venueCountMap: Record<string, number> = {};
        for (const l of locationsRes.data ?? []) venueCountMap[l.party_id] = (venueCountMap[l.party_id] ?? 0) + 1;

        const allMemberIds = [...new Set((allMembersRes.data ?? []).map((m: any) => m.user_id))];
        const { data: memberUsers } = allMemberIds.length > 0
            ? await supabaseAdmin.from('users').select('id, display_name, avatar_url, avatar_color').in('id', allMemberIds)
            : { data: [] as any[] };
        const userMap: Record<string, any> = Object.fromEntries((memberUsers ?? []).map((u: any) => [u.id, u]));

        res.json(parties.map((p: any) => {
            const memberIds = memberMap[p.id] ?? [];
            return {
                ...p,
                member_count: memberIds.length,
                total_votes: voteCountMap[p.id] ?? 0,
                venue_count: venueCountMap[p.id] ?? 0,
                member_avatars: memberIds.slice(0, 3).map((uid: string) => {
                    const u = userMap[uid];
                    return {
                        avatar_url: u?.avatar_url ?? null,
                        avatar_color: u?.avatar_color ?? null,
                        initial: (u?.display_name ?? '?')[0].toUpperCase(),
                    };
                }),
            };
        }));
    } catch (e) { next(e); }
});

router.get('/me/hangouts', requireAuth, async (req: AuthedRequest, res, next) => {
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
            .select('id, name, code, status, host_user_id, matched_location_id, locked_date_id')
            .in('id', partyIds)
            .in('status', ['matched', 'scheduled', 'locked']);
        if (partyErr) throw new HttpError(500, 'parties_query_failed', partyErr.message);
        if (!parties || parties.length === 0) return res.json([]);

        const locationIds = [...new Set(parties.map((p: any) => p.matched_location_id).filter(Boolean))];
        const dateIds     = [...new Set(parties.map((p: any) => p.locked_date_id).filter(Boolean))];
        const allPartyIds = parties.map((p: any) => p.id);

        const [venueRes, dateRes, memberRes] = await Promise.all([
            locationIds.length > 0
                ? supabaseAdmin.from('locations').select('id, name, address, latitude, longitude').in('id', locationIds)
                : Promise.resolve({ data: [] as any[] }),
            dateIds.length > 0
                ? supabaseAdmin.from('party_dates').select('id, starts_at, ends_at').in('id', dateIds)
                : Promise.resolve({ data: [] as any[] }),
            supabaseAdmin.from('party_members').select('party_id').in('party_id', allPartyIds),
        ]);

        const locationMap: Record<string, any> = Object.fromEntries((venueRes.data ?? []).map((l: any) => [l.id, l]));
        const dateMap: Record<string, any>     = Object.fromEntries((dateRes.data ?? []).map((d: any) => [d.id, d]));
        const countMap: Record<string, number> = {};
        for (const row of memberRes.data ?? []) {
            countMap[row.party_id] = (countMap[row.party_id] ?? 0) + 1;
        }

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

router.delete('/me', requireAuth, async (req: AuthedRequest, res, next) => {
    const userId = req.user!.id;
    const errors: string[] = [];

    try {
        // GCal cleanup must happen before the users row is deleted because
        // deleteCalendarEventForUser reads OAuth tokens from the users table.
        try {
            const { data: memberRows } = await supabaseAdmin
                .from('party_members')
                .select('party_id')
                .eq('user_id', userId);

            const memberPartyIds = (memberRows ?? []).map((r: any) => r.party_id);

            if (memberPartyIds.length > 0) {
                const { data: partiesWithEvent } = await supabaseAdmin
                    .from('parties')
                    .select('gcal_event_id')
                    .in('id', memberPartyIds)
                    .not('gcal_event_id', 'is', null);

                const eventIds = (partiesWithEvent ?? [])
                    .map((p: any) => p.gcal_event_id as string)
                    .filter(Boolean);

                for (const eventId of eventIds) {
                    try {
                        await deleteCalendarEventForUser(userId, eventId);
                    } catch (e: any) {
                        errors.push(`gcal_event_${eventId}: ${e.message}`);
                    }
                }
            }
        } catch (e: any) { errors.push(`gcal_lookup: ${e.message}`); }

        const { data: hostedParties } = await supabaseAdmin
            .from('parties')
            .select('id')
            .eq('host_user_id', userId);

        const hostedIds = (hostedParties ?? []).map((p: any) => p.id);

        if (hostedIds.length > 0) {
            try {
                const { data: pDates } = await supabaseAdmin
                    .from('party_dates').select('id').in('party_id', hostedIds);
                const dateIds = (pDates ?? []).map((d: any) => d.id);
                if (dateIds.length > 0) {
                    await supabaseAdmin.from('date_votes').delete().in('party_date_id', dateIds);
                }
            } catch (e: any) { errors.push(`date_votes: ${e.message}`); }

            try {
                await supabaseAdmin.from('party_dates').delete().in('party_id', hostedIds);
            } catch (e: any) { errors.push(`party_dates: ${e.message}`); }

            try {
                await supabaseAdmin.from('votes').delete().in('party_id', hostedIds);
            } catch (e: any) { errors.push(`votes: ${e.message}`); }

            try {
                await supabaseAdmin.from('locations').delete().in('party_id', hostedIds);
            } catch (e: any) { errors.push(`locations: ${e.message}`); }

            try {
                await supabaseAdmin.from('party_members').delete().in('party_id', hostedIds);
            } catch (e: any) { errors.push(`party_members_hosted: ${e.message}`); }

            try {
                await supabaseAdmin.from('parties').delete().in('id', hostedIds);
            } catch (e: any) { errors.push(`parties: ${e.message}`); }
        }

        try {
            await supabaseAdmin.from('party_members').delete().eq('user_id', userId);
        } catch (e: any) { errors.push(`party_members_member: ${e.message}`); }

        try {
            await supabaseAdmin.storage.from('avatars').remove([`${userId}.jpg`]);
        } catch (e: any) { errors.push(`storage_avatar: ${e.message}`); }

        try {
            const { data: photoFiles } = await supabaseAdmin.storage
                .from('feed-photos')
                .list(userId);
            const photoPaths = (photoFiles ?? []).map((f: any) => `${userId}/${f.name}`);
            if (photoPaths.length > 0) {
                await supabaseAdmin.storage.from('feed-photos').remove(photoPaths);
            }
        } catch (e: any) { errors.push(`storage_feed_photos: ${e.message}`); }

        try {
            await supabaseAdmin.from('users').delete().eq('id', userId);
        } catch (e: any) { errors.push(`users: ${e.message}`); }

        // Must be last — deleting the auth record invalidates the token.
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

router.get('/username-available', requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        const candidate = ((req.query.u as string) ?? '').toLowerCase().trim();
        const check = validateUsername(candidate);
        if (!check.valid) return res.json({ available: false, valid: false, reason: check.reason });

        const { data } = await supabaseAdmin
            .from('users')
            .select('id')
            .eq('username', candidate)
            .neq('id', req.user!.id)
            .maybeSingle();

        if (data) return res.json({ available: false, valid: true, reason: 'taken' });
        res.json({ available: true, valid: true });
    } catch (e) { next(e); }
});

router.get('/me/hints', requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        const { data } = await supabaseAdmin
            .from('user_screen_hints')
            .select('screen_key')
            .eq('user_id', req.user!.id);
        res.json((data ?? []).map((r: any) => r.screen_key));
    } catch (e) { next(e); }
});

router.post('/me/hints', requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        const { screen_key } = req.body;
        if (!screen_key || typeof screen_key !== 'string') throw new HttpError(400, 'missing_screen_key');
        await supabaseAdmin
            .from('user_screen_hints')
            .upsert({ user_id: req.user!.id, screen_key }, { onConflict: 'user_id,screen_key' });
        res.json({ ok: true });
    } catch (e) { next(e); }
});

const locationPermissionSchema = z.object({
    status: z.enum(['granted', 'maybe_later']),
});

router.post('/me/location-permission', requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        const body = locationPermissionSchema.parse(req.body);
        const { error } = await supabaseAdmin
            .from('users')
            .update({ location_permission_status: body.status, updated_at: new Date().toISOString() })
            .eq('id', req.user!.id);
        if (error) throw new HttpError(500, 'update_failed', error.message);
        res.json({ ok: true });
    } catch (e) { next(e); }
});

router.delete('/me/location', requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        const { error } = await supabaseAdmin
            .from('users')
            .update({
                latitude: null,
                longitude: null,
                location_permission_status: 'maybe_later',
                updated_at: new Date().toISOString(),
            })
            .eq('id', req.user!.id);
        if (error) throw new HttpError(500, 'update_failed', error.message);
        res.json({ ok: true });
    } catch (e) { next(e); }
});

router.post('/me/walkthrough-seen', requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        await supabaseAdmin
            .from('users')
            .update({ has_seen_walkthrough: true })
            .eq('id', req.user!.id);
        res.json({ ok: true });
    } catch (e) { next(e); }
});

router.get('/me/blocked', requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        const me = req.user!.id;
        const { data: blocks, error } = await supabaseAdmin
            .from('user_blocks')
            .select('blocked_id, blocked_at')
            .eq('blocker_id', me)
            .order('blocked_at', { ascending: false });
        if (error) throw new HttpError(500, 'fetch_blocked_failed', error.message);

        const blockedIds = (blocks ?? []).map((b: any) => b.blocked_id);
        if (blockedIds.length === 0) return res.json([]);

        const { data: users } = await supabaseAdmin
            .from('users')
            .select('id, display_name, username, avatar_url, avatar_color')
            .in('id', blockedIds);

        const userMap = Object.fromEntries((users ?? []).map((u: any) => [u.id, u]));

        res.json((blocks ?? []).map((b: any) => ({
            ...(userMap[b.blocked_id] ?? { id: b.blocked_id }),
            blocked_at: b.blocked_at,
        })));
    } catch (e) { next(e); }
});

router.delete('/me/followers/:userId', requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        const me = req.user!.id;
        const followerToRemove = req.params.userId;

        const { error } = await supabaseAdmin
            .from('user_follows')
            .delete()
            .eq('follower_id', followerToRemove)
            .eq('followed_id', me);
        if (error) throw new HttpError(500, 'remove_follower_failed', error.message);

        res.json({ ok: true });
    } catch (e) { next(e); }
});

router.get('/:id/public', requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        const me = req.user!.id;
        const targetId = req.params.id;

        // Check if target has blocked caller
        const { data: blockedByTarget } = await supabaseAdmin
            .from('user_blocks')
            .select('blocker_id')
            .eq('blocker_id', targetId)
            .eq('blocked_id', me)
            .maybeSingle();
        if (blockedByTarget) throw new HttpError(403, 'blocked');

        const { data, error } = await supabaseAdmin
            .from('users')
            .select('id, display_name, username, avatar_url, avatar_color, school_id, graduation_year, pronouns, birthday, bio')
            .eq('id', targetId)
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

        const [followerRes, followingRes, blockedByMeRes] = await Promise.all([
            supabaseAdmin.from('user_follows').select('follower_id', { count: 'exact', head: true }).eq('followed_id', targetId),
            supabaseAdmin.from('user_follows').select('followed_id', { count: 'exact', head: true }).eq('follower_id', targetId),
            supabaseAdmin.from('user_blocks').select('blocker_id').eq('blocker_id', me).eq('blocked_id', targetId).maybeSingle(),
        ]);

        res.json({
            id: data.id,
            display_name: data.display_name,
            username: data.username ?? null,
            avatar_url: data.avatar_url,
            avatar_color: data.avatar_color,
            school,
            graduation_year: data.graduation_year,
            pronouns: data.pronouns ?? null,
            age: computeAge(data.birthday),
            bio: data.bio ?? null,
            follower_count: followerRes.count ?? 0,
            following_count: followingRes.count ?? 0,
            is_blocked_by_me: blockedByMeRes.data != null,
        });
    } catch (e) { next(e); }
});

router.get('/:id/follow-counts', requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        const targetId = req.params.id;
        const [followerRes, followingRes] = await Promise.all([
            supabaseAdmin.from('user_follows').select('follower_id', { count: 'exact', head: true }).eq('followed_id', targetId),
            supabaseAdmin.from('user_follows').select('followed_id', { count: 'exact', head: true }).eq('follower_id', targetId),
        ]);
        res.json({ followers: followerRes.count ?? 0, following: followingRes.count ?? 0 });
    } catch (e) { next(e); }
});

router.get('/:id/followers', requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        const me = req.user!.id;
        const targetId = req.params.id;
        const limit = Math.min(parseInt((req.query.limit as string) ?? '50', 10), 100);
        const before = req.query.before as string | undefined;

        let query = supabaseAdmin
            .from('user_follows')
            .select('follower_id, followed_at')
            .eq('followed_id', targetId)
            .order('followed_at', { ascending: false })
            .limit(limit);
        if (before) query = query.lt('followed_at', before);

        const { data: follows, error } = await query;
        if (error) throw new HttpError(500, 'fetch_followers_failed', error.message);

        const followerIds = (follows ?? []).map((f: any) => f.follower_id);
        if (followerIds.length === 0) return res.json([]);

        const [usersRes, followsBackRes, blocksRes] = await Promise.all([
            supabaseAdmin.from('users').select('id, display_name, username, avatar_url, avatar_color').in('id', followerIds),
            supabaseAdmin.from('user_follows').select('followed_id').eq('follower_id', me).in('followed_id', followerIds),
            supabaseAdmin.from('user_blocks').select('blocked_id').eq('blocker_id', me).in('blocked_id', followerIds),
        ]);

        const userMap = Object.fromEntries((usersRes.data ?? []).map((u: any) => [u.id, u]));
        const followsBackSet = new Set((followsBackRes.data ?? []).map((r: any) => r.followed_id));
        const blockedSet = new Set((blocksRes.data ?? []).map((r: any) => r.blocked_id));
        const followedAtMap = Object.fromEntries((follows ?? []).map((f: any) => [f.follower_id, f.followed_at]));

        res.json(followerIds.map((id: string) => ({
            ...(userMap[id] ?? { id }),
            followed_at: followedAtMap[id],
            follows_back: followsBackSet.has(id),
            is_blocked: blockedSet.has(id),
        })));
    } catch (e) { next(e); }
});

router.get('/:id/following', requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        const me = req.user!.id;
        const targetId = req.params.id;
        const limit = Math.min(parseInt((req.query.limit as string) ?? '50', 10), 100);
        const before = req.query.before as string | undefined;

        let query = supabaseAdmin
            .from('user_follows')
            .select('followed_id, followed_at')
            .eq('follower_id', targetId)
            .order('followed_at', { ascending: false })
            .limit(limit);
        if (before) query = query.lt('followed_at', before);

        const { data: follows, error } = await query;
        if (error) throw new HttpError(500, 'fetch_following_failed', error.message);

        const followedIds = (follows ?? []).map((f: any) => f.followed_id);
        if (followedIds.length === 0) return res.json([]);

        const [usersRes, followsBackRes, blocksRes] = await Promise.all([
            supabaseAdmin.from('users').select('id, display_name, username, avatar_url, avatar_color').in('id', followedIds),
            supabaseAdmin.from('user_follows').select('followed_id').eq('follower_id', me).in('followed_id', followedIds),
            supabaseAdmin.from('user_blocks').select('blocked_id').eq('blocker_id', me).in('blocked_id', followedIds),
        ]);

        const userMap = Object.fromEntries((usersRes.data ?? []).map((u: any) => [u.id, u]));
        const followsBackSet = new Set((followsBackRes.data ?? []).map((r: any) => r.followed_id));
        const blockedSet = new Set((blocksRes.data ?? []).map((r: any) => r.blocked_id));
        const followedAtMap = Object.fromEntries((follows ?? []).map((f: any) => [f.followed_id, f.followed_at]));

        res.json(followedIds.map((id: string) => ({
            ...(userMap[id] ?? { id }),
            followed_at: followedAtMap[id],
            follows_back: followsBackSet.has(id),
            is_blocked: blockedSet.has(id),
        })));
    } catch (e) { next(e); }
});

router.post('/:id/block', requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        const me = req.user!.id;
        const target = req.params.id;
        if (me === target) throw new HttpError(400, 'cannot_block_self');

        const { error: blockErr } = await supabaseAdmin
            .from('user_blocks')
            .upsert({ blocker_id: me, blocked_id: target }, { onConflict: 'blocker_id,blocked_id' });
        if (blockErr) throw new HttpError(500, 'block_failed', blockErr.message);

        await Promise.all([
            supabaseAdmin.from('user_follows').delete()
                .or(`and(follower_id.eq.${me},followed_id.eq.${target}),and(follower_id.eq.${target},followed_id.eq.${me})`),
            supabaseAdmin.from('friendships').delete()
                .or(`and(requester_id.eq.${me},addressee_id.eq.${target}),and(requester_id.eq.${target},addressee_id.eq.${me})`),
        ]);

        res.json({ blocked: true });
    } catch (e) { next(e); }
});

router.delete('/:id/block', requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        const me = req.user!.id;
        const { error } = await supabaseAdmin
            .from('user_blocks')
            .delete()
            .eq('blocker_id', me)
            .eq('blocked_id', req.params.id);
        if (error) throw new HttpError(500, 'unblock_failed', error.message);
        res.json({ ok: true });
    } catch (e) { next(e); }
});

router.post('/:id/follow', requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        const me = req.user!.id;
        const target = req.params.id;
        if (me === target) throw new HttpError(400, 'cannot_follow_self');

        const blocked = await isEitherBlocked(me, target);
        if (blocked) throw new HttpError(403, 'blocked');

        const { error } = await supabaseAdmin
            .from('user_follows')
            .upsert({ follower_id: me, followed_id: target }, { onConflict: 'follower_id,followed_id' });
        if (error) throw new HttpError(500, 'follow_failed', error.message);

        res.json({ ok: true });
    } catch (e) { next(e); }
});

router.delete('/:id/follow', requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        const { error } = await supabaseAdmin
            .from('user_follows')
            .delete()
            .eq('follower_id', req.user!.id)
            .eq('followed_id', req.params.id);
        if (error) throw new HttpError(500, 'unfollow_failed', error.message);

        res.json({ ok: true });
    } catch (e) { next(e); }
});

export default router;
