import { Router } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../db';
import { requireAuth, AuthedRequest } from '../middleware/auth';
import { HttpError } from '../middleware/error';
import { midpoint, maxSpreadKm, distanceMiles, LatLng } from '../services/midpoint';
import { searchNearbyVenues, searchNearbyVenuesPaged, getVenuesWithRotation } from '../services/places';
import { deleteCalendarEventForUser } from '../services/googleCalendar';
import { fuzzCoords } from '../services/locationFuzz';
import { generateVenuePitch } from '../services/aiPitch';
import { evaluateProposal } from '../services/matchEngine';

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

const createSchema = z.object({
    name: z.string().max(100).optional(),
    is_public: z.boolean().optional().default(false),
});

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
                is_public: body.is_public ?? false,
            })
            .select()
            .single();
        if (error || !party) throw new HttpError(500, 'create_failed', error?.message);

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

        const { data: rawMembers } = await supabaseAdmin
            .from('party_members')
            .select('user_id, joined_at, is_online')
            .eq('party_id', partyId);

        const memberUserIds = (rawMembers ?? []).map((m: any) => m.user_id);
        const { data: memberUsers } = memberUserIds.length > 0
            ? await supabaseAdmin.from('users').select('id, display_name, avatar_color, avatar_url').in('id', memberUserIds)
            : { data: [] as any[] };
        const userMap: Record<string, any> = Object.fromEntries((memberUsers ?? []).map((u: any) => [u.id, u]));

        const members = (rawMembers ?? []).map((m: any) => ({ ...m, users: userMap[m.user_id] ?? null }));
        res.json({ party, members });
    } catch (e) { next(e); }
});

router.get('/:id/members', requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        const partyId = req.params.id;
        await assertMember(partyId, req.user!.id);

        const { data: rawMembers, error: memberErr } = await supabaseAdmin
            .from('party_members')
            .select('user_id, is_online, joined_at')
            .eq('party_id', partyId);
        if (memberErr) throw memberErr;

        const memberUserIds = (rawMembers ?? []).map((m: any) => m.user_id);
        const { data: memberUsers } = memberUserIds.length > 0
            ? await supabaseAdmin.from('users').select('id, display_name, username, avatar_color, avatar_url, latitude, longitude').in('id', memberUserIds)
            : { data: [] as any[] };
        const userMap: Record<string, any> = Object.fromEntries((memberUsers ?? []).map((u: any) => [u.id, u]));

        res.json((rawMembers ?? []).map((m: any) => {
            const u = userMap[m.user_id];
            const fuzzed = u?.latitude != null && u?.longitude != null
                ? fuzzCoords(u.latitude, u.longitude, m.user_id)
                : null;
            const { latitude, longitude, ...safeUser } = u ?? {};
            return {
                ...m,
                users: u ? safeUser : null,
                display_lat: fuzzed?.lat ?? null,
                display_lng: fuzzed?.lng ?? null,
            };
        }));
    } catch (e) { next(e); }
});

router.patch('/:id/visibility', requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        const { is_public } = z.object({ is_public: z.boolean() }).parse(req.body);
        await assertHost(req.params.id, req.user!.id);
        const { error } = await supabaseAdmin
            .from('parties')
            .update({ is_public })
            .eq('id', req.params.id);
        if (error) throw new HttpError(500, 'update_failed', error.message);
        res.json({ ok: true, is_public });
    } catch (e) { next(e); }
});

router.delete('/:id/leave', requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        const partyId = req.params.id;
        const userId = req.user!.id;

        (async () => {
            try {
                const { data: party } = await supabaseAdmin
                    .from('parties').select('gcal_event_id').eq('id', partyId).single();
                if (party?.gcal_event_id) {
                    await deleteCalendarEventForUser(userId, party.gcal_event_id);
                }
            } catch (e) { console.error('[party:leave] gcal delete failed (non-fatal):', e); }
        })();

        await supabaseAdmin
            .from('party_members')
            .delete()
            .eq('party_id', partyId)
            .eq('user_id', userId);
        res.json({ ok: true });
    } catch (e) { next(e); }
});

router.delete('/:id', requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        const partyId = req.params.id;
        const hostId = req.user!.id;
        await assertHost(partyId, hostId);

        (async () => {
            try {
                const { data: party } = await supabaseAdmin
                    .from('parties').select('gcal_event_id').eq('id', partyId).single();
                if (party?.gcal_event_id) {
                    await deleteCalendarEventForUser(hostId, party.gcal_event_id);
                }
            } catch (e) { console.error('[party:delete] gcal delete failed (non-fatal):', e); }
        })();

        const { data: pDates } = await supabaseAdmin
            .from('party_dates').select('id').eq('party_id', partyId);
        const dateIds = (pDates ?? []).map((d: any) => d.id);
        if (dateIds.length > 0) {
            await supabaseAdmin.from('date_votes').delete().in('party_date_id', dateIds);
        }
        await supabaseAdmin.from('party_dates').delete().eq('party_id', partyId);
        await supabaseAdmin.from('votes').delete().eq('party_id', partyId);
        await supabaseAdmin.from('locations').delete().eq('party_id', partyId);
        await supabaseAdmin.from('party_members').delete().eq('party_id', partyId);
        const { error } = await supabaseAdmin.from('parties').delete().eq('id', partyId);
        if (error) throw new HttpError(500, 'delete_failed', error.message);

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

        const { data: memberRows } = await supabaseAdmin
            .from('party_members')
            .select('user_id')
            .eq('party_id', partyId);

        const startUserIds = (memberRows ?? []).map((m: any) => m.user_id);
        const { data: startUsers } = startUserIds.length > 0
            ? await supabaseAdmin.from('users').select('id, latitude, longitude').in('id', startUserIds)
            : { data: [] as any[] };

        const points: LatLng[] = (startUsers ?? [])
            .filter((u: any) => u.latitude != null && u.longitude != null)
            .map((u: any) => ({ latitude: u.latitude, longitude: u.longitude }));

        if (points.length === 0) throw new HttpError(400, 'no_member_locations');

        const center = midpoint(points);
        const spread = maxSpreadKm(points);
        const radiusMeters = Math.min(Math.max(2000, spread * 1000 * 0.15), 25_000);

        const venues = await searchNearbyVenues(center, radiusMeters, 10);
        if (venues.length === 0) throw new HttpError(502, 'no_venues_found');

        const rows = venues.map((v) => ({ ...v, party_id: partyId }));
        const { error: insertErr } = await supabaseAdmin.from('locations').insert(rows);
        if (insertErr && !insertErr.message.includes('duplicate')) {
            throw new HttpError(500, 'insert_failed', insertErr.message);
        }

        const { error: updateErr } = await supabaseAdmin
            .from('parties')
            .update({
                status: 'swiping',
                midpoint_lat: center.latitude,
                midpoint_lng: center.longitude,
                current_card_index: 0,
                voting_round: 1,
                updated_at: new Date().toISOString(),
            })
            .eq('id', partyId);
        if (updateErr) throw new HttpError(500, 'status_update_failed', updateErr.message);

        // Seed the legacy pagination token so /more-venues gets page-2 results
        // rather than duplicating the initial New API result set.
        (async () => {
            try {
                const { nextPageToken } = await searchNearbyVenuesPaged(center, radiusMeters);
                if (nextPageToken) {
                    await supabaseAdmin
                        .from('parties')
                        .update({ next_page_token: nextPageToken })
                        .eq('id', partyId);
                }
            } catch (e) {
                console.error('[party:start] legacy token seed failed (non-fatal):', e);
            }
        })();

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
            .order('is_priority', { ascending: false })
            .order('rating', { ascending: false, nullsFirst: false })
            .order('id', { ascending: true });
        if (error) throw error;

        const { data: locMemberRows } = await supabaseAdmin
            .from('party_members')
            .select('user_id')
            .eq('party_id', partyId);

        const locUserIds = (locMemberRows ?? []).map((m: any) => m.user_id);
        const { data: locUsers } = locUserIds.length > 0
            ? await supabaseAdmin.from('users').select('id, display_name, latitude, longitude').in('id', locUserIds)
            : { data: [] as any[] };

        const memberCoords = (locUsers ?? []).map((u: any) => ({
            user_id: u.id,
            display_name: u.display_name,
            latitude: u.latitude,
            longitude: u.longitude,
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

router.get('/:id/pitch', requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        const partyId = req.params.id;
        const venueId = req.query.venue_id as string;
        if (!venueId) throw new HttpError(400, 'missing_venue_id');

        await assertMember(partyId, req.user!.id);

        const [venueRes, memberRes, partyRes] = await Promise.all([
            supabaseAdmin
                .from('locations')
                .select('name, category, rating, price_level, address, user_ratings_total')
                .eq('id', venueId)
                .eq('party_id', partyId)
                .single(),
            supabaseAdmin
                .from('party_members')
                .select('*', { count: 'exact', head: true })
                .eq('party_id', partyId),
            supabaseAdmin.from('parties').select('name').eq('id', partyId).single(),
        ]);

        if (venueRes.error || !venueRes.data) throw new HttpError(404, 'venue_not_found');

        const v = venueRes.data;
        const result = await generateVenuePitch(
            {
                name: v.name,
                category: v.category,
                rating: v.rating,
                price_level: v.price_level,
                address: v.address,
                user_ratings_total: v.user_ratings_total,
            },
            {
                member_count: memberRes.count ?? 1,
                party_name: partyRes.data?.name ?? null,
            },
        );

        res.json(result);
    } catch (e) { next(e); }
});

router.get('/:id/more-venues', requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        const partyId = req.params.id;
        await assertMember(partyId, req.user!.id);

        const { data: party } = await supabaseAdmin
            .from('parties')
            .select('midpoint_lat, midpoint_lng, next_page_token, venue_rotation_seed')
            .eq('id', partyId)
            .single();

        if (!party?.midpoint_lat || !party?.midpoint_lng) {
            return res.json({ new_venue_count: 0, exhausted: false });
        }

        const center = { latitude: party.midpoint_lat, longitude: party.midpoint_lng };
        const rotationSeed: number = party.venue_rotation_seed ?? 0;
        const pageToken: string | undefined = party.next_page_token ?? undefined;

        const { data: existing } = await supabaseAdmin
            .from('locations')
            .select('google_place_id')
            .eq('party_id', partyId);
        const existingIds = new Set((existing ?? []).map((r: any) => r.google_place_id));

        const { venues, nextPageToken, newSeed, exhausted } = await getVenuesWithRotation({
            center,
            pageToken,
            rotationSeed,
            excludeIds: existingIds,
        });

        await supabaseAdmin
            .from('parties')
            .update({ next_page_token: nextPageToken, venue_rotation_seed: newSeed })
            .eq('id', partyId);

        if (venues.length === 0) {
            return res.json({ new_venue_count: 0, exhausted });
        }

        const rows = venues.map((v) => ({ ...v, party_id: partyId }));
        const { data: inserted, error: insertErr } = await supabaseAdmin
            .from('locations')
            .upsert(rows, { onConflict: 'party_id,google_place_id', ignoreDuplicates: true })
            .select('id');

        if (insertErr) {
            console.error('[load-more] insert error:', insertErr.message);
        }

        const insertedCount = inserted?.length ?? 0;
        return res.json({ new_venue_count: insertedCount, exhausted, newToken: nextPageToken ? true : false });
    } catch (e) { next(e); }
});

router.post('/:id/reset', requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        const partyId = req.params.id;
        await assertHost(partyId, req.user!.id);

        const { error: voteErr } = await supabaseAdmin.from('votes').delete().eq('party_id', partyId);
        if (voteErr) throw new HttpError(500, 'reset_votes_failed', voteErr.message);

        const { error: updateErr } = await supabaseAdmin
            .from('parties')
            .update({
                status: 'swiping',
                matched_location_id: null,
                current_card_index: 0,
                voting_round: 1,
                proposal_location_id: null,
                proposal_rank: 0,
                rejected_location_ids: [],
                updated_at: new Date().toISOString(),
            })
            .eq('id', partyId);
        if (updateErr) throw new HttpError(500, 'reset_status_failed', updateErr.message);

        res.json({ ok: true });
    } catch (e) { next(e); }
});

router.post('/:id/force-match', requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        const partyId = req.params.id;
        const userId = req.user!.id;

        await assertMember(partyId, userId);

        const { count: memberCount } = await supabaseAdmin
            .from('party_members')
            .select('*', { count: 'exact', head: true })
            .eq('party_id', partyId);

        if ((memberCount ?? 0) !== 1) throw new HttpError(403, 'not_solo_party');

        const { data: party } = await supabaseAdmin
            .from('parties')
            .select('status')
            .eq('id', partyId)
            .single();

        if (!party) throw new HttpError(404, 'party_not_found');
        if (party.status !== 'swiping') throw new HttpError(409, 'party_not_swiping');

        const { data: recentLike } = await supabaseAdmin
            .from('votes')
            .select('location_id')
            .eq('party_id', partyId)
            .eq('user_id', userId)
            .eq('vote', true)
            .order('voted_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (!recentLike) {
            return res.json({ matched: false, reason: 'no_likes_yet' });
        }

        const { error: updateErr } = await supabaseAdmin
            .from('parties')
            .update({
                status: 'matched',
                matched_location_id: recentLike.location_id,
                updated_at: new Date().toISOString(),
            })
            .eq('id', partyId)
            .eq('status', 'swiping');

        if (updateErr) throw new HttpError(500, 'match_failed', updateErr.message);

        res.json({ matched: true, location_id: recentLike.location_id });
    } catch (e) { next(e); }
});

const proposalRespondSchema = z.object({ accepted: z.boolean() });

router.post('/:id/proposal/respond', requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        const partyId = req.params.id;
        await assertMember(partyId, req.user!.id);

        const { accepted } = proposalRespondSchema.parse(req.body);

        const { data: party } = await supabaseAdmin
            .from('parties')
            .select('proposal_location_id, proposal_rank, voting_round, status')
            .eq('id', partyId)
            .single();

        if (!party) throw new HttpError(404, 'party_not_found');
        if (party.status !== 'proposing') throw new HttpError(409, 'party_not_proposing');
        if (!party.proposal_location_id) throw new HttpError(409, 'no_active_proposal');

        const { error: upsertErr } = await supabaseAdmin
            .from('proposal_responses')
            .upsert(
                {
                    party_id: partyId,
                    voting_round: party.voting_round,
                    proposal_rank: party.proposal_rank,
                    location_id: party.proposal_location_id,
                    user_id: req.user!.id,
                    accepted,
                    responded_at: new Date().toISOString(),
                },
                { onConflict: 'party_id,voting_round,proposal_rank,user_id' }
            );
        if (upsertErr) throw new HttpError(500, 'response_failed', upsertErr.message);

        await evaluateProposal(partyId);

        res.json({ ok: true });
    } catch (e) { next(e); }
});

export default router;
