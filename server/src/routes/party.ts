import { Router } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../db';
import { requireAuth, AuthedRequest } from '../middleware/auth';
import { HttpError } from '../middleware/error';
import { midpoint, maxSpreadKm, distanceMiles, LatLng } from '../services/midpoint';
import { searchNearbyVenues } from '../services/places';

const router = Router();

function generateCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
}

async function generateUniqueCode(): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt++) {
        const code = generateCode();
        const { data } = await supabaseAdmin.from('parties').select('id').eq('code', code).maybeSingle();
        if (!data) return code;
    }
    throw new HttpError(500, 'code_collision');
}

async function assertMember(partyId: string, userId: string) {
    const { data } = await supabaseAdmin
        .from('party_members')
        .select('user_id')
        .eq('party_id', partyId)
        .eq('user_id', userId)
        .maybeSingle();
    if (!data) throw new HttpError(403, 'not_a_member');
}

async function assertHost(partyId: string, userId: string) {
    const { data } = await supabaseAdmin.from('parties').select('host_user_id').eq('id', partyId).single();
    if (!data) throw new HttpError(404, 'party_not_found');
    if (data.host_user_id !== userId) throw new HttpError(403, 'not_host');
}

const createSchema = z.object({ name: z.string().max(100).optional() });

router.post('/', requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        const body = createSchema.parse(req.body ?? {});
        const code = await generateUniqueCode();
        const { data: party, error } = await supabaseAdmin
            .from('parties')
            .insert({
                code,
                name: body.name ?? null,
                host_user_id: req.user!.id,
                status: 'waiting',
            })
            .select()
            .single();
        if (error || !party) throw new HttpError(500, 'create_failed', error?.message);

        // Auto-add host as member
        await supabaseAdmin.from('party_members').insert({
            party_id: party.id,
            user_id: req.user!.id,
            is_online: true,
        });

        res.status(201).json({ party_id: party.id, code: party.code, party });
    } catch (e) { next(e); }
});

const joinSchema = z.object({ code: z.string().length(6) });

router.post('/join', requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        const body = joinSchema.parse(req.body);
        const { data: party } = await supabaseAdmin
            .from('parties')
            .select('id, status, code')
            .eq('code', body.code.toUpperCase())
            .maybeSingle();
        if (!party) throw new HttpError(404, 'party_not_found');
        if (party.status !== 'waiting' && party.status !== 'swiping') {
            throw new HttpError(409, 'party_already_closed');
        }
        const { error } = await supabaseAdmin
            .from('party_members')
            .upsert({ party_id: party.id, user_id: req.user!.id, is_online: true });
        if (error) throw new HttpError(500, 'join_failed', error.message);
        res.json({ party_id: party.id });
    } catch (e) { next(e); }
});

router.get('/:id', requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        const partyId = req.params.id;
        await assertMember(partyId, req.user!.id);
        const { data: party } = await supabaseAdmin.from('parties').select('*').eq('id', partyId).single();
        const { data: members } = await supabaseAdmin
            .from('party_members')
            .select('user_id, joined_at, is_online, users(id, display_name, avatar_color)')
            .eq('party_id', partyId);
        res.json({ party, members: members ?? [] });
    } catch (e) { next(e); }
});

router.get('/:id/members', requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        const partyId = req.params.id;
        await assertMember(partyId, req.user!.id);
        const { data, error } = await supabaseAdmin
            .from('party_members')
            .select('user_id, is_online, joined_at, users(id, display_name, avatar_color)')
            .eq('party_id', partyId);
        if (error) throw error;
        res.json(data ?? []);
    } catch (e) { next(e); }
});

router.delete('/:id/leave', requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        const partyId = req.params.id;
        await supabaseAdmin
            .from('party_members')
            .delete()
            .eq('party_id', partyId)
            .eq('user_id', req.user!.id);
        res.json({ ok: true });
    } catch (e) { next(e); }
});

router.post('/:id/start', requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        const partyId = req.params.id;
        await assertHost(partyId, req.user!.id);

        const { data: party } = await supabaseAdmin.from('parties').select('status').eq('id', partyId).single();
        if (!party) throw new HttpError(404, 'party_not_found');
        if (party.status !== 'waiting') throw new HttpError(409, 'party_already_started');

        // Pull all member coordinates
        const { data: members } = await supabaseAdmin
            .from('party_members')
            .select('user_id, users(latitude, longitude)')
            .eq('party_id', partyId);

        const points: LatLng[] = (members ?? [])
            .map((m: any) => m.users)
            .filter((u: any) => u && u.latitude != null && u.longitude != null)
            .map((u: any) => ({ latitude: u.latitude, longitude: u.longitude }));

        if (points.length === 0) throw new HttpError(400, 'no_member_locations');

        const center = midpoint(points);
        const spread = maxSpreadKm(points);
        const radiusMeters = Math.min(Math.max(2000, spread * 1000 * 0.15), 25_000);

        // Fetch venues (one Places call per party - cached on the locations table)
        const venues = await searchNearbyVenues(center, radiusMeters, 15);
        if (venues.length === 0) throw new HttpError(502, 'no_venues_found');

        // Insert candidates
        const rows = venues.map((v) => ({ ...v, party_id: partyId }));
        const { error: insertErr } = await supabaseAdmin.from('locations').insert(rows);
        if (insertErr && !insertErr.message.includes('duplicate')) {
            throw new HttpError(500, 'insert_failed', insertErr.message);
        }

        // Flip status + store midpoint
        const { error: updateErr } = await supabaseAdmin
            .from('parties')
            .update({
                status: 'swiping',
                midpoint_lat: center.latitude,
                midpoint_lng: center.longitude,
                updated_at: new Date().toISOString(),
            })
            .eq('id', partyId);
        if (updateErr) throw new HttpError(500, 'status_update_failed', updateErr.message);

        res.json({
            ok: true,
            midpoint: center,
            spread_km: spread,
            warning: spread > 1000 ? 'large_spread' : null,
            venue_count: venues.length,
        });
    } catch (e) { next(e); }
});

router.get('/:id/locations', requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        const partyId = req.params.id;
        await assertMember(partyId, req.user!.id);

        const { data: locations, error } = await supabaseAdmin
            .from('locations')
            .select('*')
            .eq('party_id', partyId)
            .order('rating', { ascending: false, nullsFirst: false });
        if (error) throw error;

        // Compute distance from each member for the match screen
        const { data: members } = await supabaseAdmin
            .from('party_members')
            .select('user_id, users(id, display_name, latitude, longitude)')
            .eq('party_id', partyId);

        const memberCoords = (members ?? []).map((m: any) => ({
            user_id: m.users?.id,
            display_name: m.users?.display_name,
            latitude: m.users?.latitude,
            longitude: m.users?.longitude,
        }));

        const enriched = (locations ?? []).map((loc) => ({
            ...loc,
            distances: memberCoords
                .filter((u) => u.latitude != null && u.longitude != null)
                .map((u) => ({
                    user_id: u.user_id,
                    display_name: u.display_name,
                    miles: distanceMiles(
                        { latitude: u.latitude!, longitude: u.longitude! },
                        { latitude: loc.latitude, longitude: loc.longitude }
                    ),
                })),
        }));

        res.json(enriched);
    } catch (e) { next(e); }
});

export default router;
