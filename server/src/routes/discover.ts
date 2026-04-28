import { Router } from 'express';
import axios from 'axios';
import { requireAuth, AuthedRequest } from '../middleware/auth';
import { HttpError } from '../middleware/error';
import { supabaseAdmin } from '../db';
import { searchNearbyVenues, searchNearbyVenuesPaged, getVenuesWithRotation } from '../services/places';
import { generateVenuePitch } from '../services/aiPitch';
import { distanceMiles, LatLng } from '../services/midpoint';
import { config } from '../config';

const router = Router();

const NEARBY_PARTY_RADIUS_MILES = 50;

const discoverPageTokens = new Map<string, string>();
const discoverRotationSeeds = new Map<string, number>();

router.get('/venues', requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        const lat = parseFloat(req.query.lat as string);
        const lng = parseFloat(req.query.lng as string);
        if (isNaN(lat) || isNaN(lng)) throw new HttpError(400, 'invalid_coordinates');

        const center = { latitude: lat, longitude: lng };
        const venues = await searchNearbyVenues(center, 8000, 20);

        const callerLoc: LatLng = { latitude: lat, longitude: lng };
        const enriched = venues.map((v) => ({
            ...v,
            distance_miles: parseFloat(
                distanceMiles(callerLoc, { latitude: v.latitude, longitude: v.longitude }).toFixed(1)
            ),
        }));

        // Seed the legacy pagination token so /venues/more gets page-2 results
        // rather than duplicating the initial New API result set.
        const userId = req.user!.id;
        discoverPageTokens.delete(userId);
        discoverRotationSeeds.delete(userId);
        (async () => {
            try {
                const { nextPageToken } = await searchNearbyVenuesPaged(center, 8000);
                if (nextPageToken) discoverPageTokens.set(userId, nextPageToken);
            } catch (e) {
                console.error('[discover:venues] legacy token seed failed (non-fatal):', e);
            }
        })();

        res.json(enriched);
    } catch (e) {
        next(e);
    }
});

router.get('/venues/more', requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        const lat = parseFloat(req.query.lat as string);
        const lng = parseFloat(req.query.lng as string);
        if (isNaN(lat) || isNaN(lng)) throw new HttpError(400, 'invalid_coordinates');

        const userId = req.user!.id;
        const storedToken = discoverPageTokens.get(userId);
        const rotationSeed = discoverRotationSeeds.get(userId) ?? 0;
        const center = { latitude: lat, longitude: lng };

        const excludeParam = ((req.query.exclude as string) ?? '').trim();
        const excludeFromClient = new Set(
            excludeParam.split(',').map((s) => s.trim()).filter(Boolean),
        );

        const { venues, nextPageToken, newSeed, exhausted } = await getVenuesWithRotation({
            center,
            pageToken: storedToken,
            rotationSeed,
            excludeIds: excludeFromClient,
        });

        if (nextPageToken) {
            discoverPageTokens.set(userId, nextPageToken);
        } else {
            discoverPageTokens.delete(userId);
            discoverRotationSeeds.set(userId, newSeed);
        }

        const callerLoc: LatLng = { latitude: lat, longitude: lng };
        const enriched = venues.map((v) => ({
            ...v,
            distance_miles: parseFloat(
                distanceMiles(callerLoc, { latitude: v.latitude, longitude: v.longitude }).toFixed(1)
            ),
        }));

        const hasMore = !exhausted;
        res.json({ venues: enriched, hasMore, exhausted, newToken: !!nextPageToken });
    } catch (e) {
        next(e);
    }
});

router.get('/parties', requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        const lat = parseFloat(req.query.lat as string);
        const lng = parseFloat(req.query.lng as string);
        if (isNaN(lat) || isNaN(lng)) throw new HttpError(400, 'invalid_coordinates');

        const callerLoc: LatLng = { latitude: lat, longitude: lng };
        const me = req.user!.id;

        const { data: friendRows } = await supabaseAdmin
            .from('friendships')
            .select('requester_id, addressee_id')
            .eq('status', 'accepted')
            .or(`requester_id.eq.${me},addressee_id.eq.${me}`);
        const friendIds = new Set<string>();
        for (const f of friendRows ?? []) {
            friendIds.add(f.requester_id === me ? f.addressee_id : f.requester_id);
        }

        const { data: myMemberships } = await supabaseAdmin
            .from('party_members')
            .select('party_id')
            .eq('user_id', me);
        const myPartyIds = new Set((myMemberships ?? []).map((m: any) => m.party_id));

        const { data: parties, error: partyErr } = await supabaseAdmin
            .from('parties')
            .select('id, name, code, status, host_user_id')
            .in('status', ['waiting', 'swiping'])
            .eq('is_public', true);
        if (partyErr) throw new HttpError(500, 'parties_query_failed', partyErr.message);

        const openParties = (parties ?? []).filter((p: any) => !myPartyIds.has(p.id));
        if (openParties.length === 0) return res.json([]);

        const openPartyIds = openParties.map((p: any) => p.id);

        const { data: memberships } = await supabaseAdmin
            .from('party_members')
            .select('party_id, user_id')
            .in('party_id', openPartyIds);

        const memberUserIds = [...new Set((memberships ?? []).map((m: any) => m.user_id as string))];
        if (memberUserIds.length === 0) return res.json([]);

        const { data: users } = await supabaseAdmin
            .from('users')
            .select('id, display_name, latitude, longitude')
            .in('id', memberUserIds);

        const userMap = new Map<string, { display_name: string; latitude: number | null; longitude: number | null }>();
        for (const u of users ?? []) {
            userMap.set(u.id, { display_name: u.display_name, latitude: u.latitude, longitude: u.longitude });
        }

        const partyMembersMap = new Map<string, string[]>();
        for (const m of memberships ?? []) {
            const arr = partyMembersMap.get(m.party_id) ?? [];
            arr.push(m.user_id);
            partyMembersMap.set(m.party_id, arr);
        }

        const result: any[] = [];
        for (const party of openParties) {
            const memberIds = partyMembersMap.get(party.id) ?? [];
            let closestMiles = Infinity;
            for (const uid of memberIds) {
                const u = userMap.get(uid);
                if (u?.latitude != null && u?.longitude != null) {
                    const d = distanceMiles(callerLoc, { latitude: u.latitude, longitude: u.longitude });
                    if (d < closestMiles) closestMiles = d;
                }
            }
            if (closestMiles <= NEARBY_PARTY_RADIUS_MILES) {
                const host = userMap.get(party.host_user_id);
                const friendsInside =
                    friendIds.has(party.host_user_id) ||
                    memberIds.some((uid: string) => friendIds.has(uid));
                result.push({
                    id: party.id,
                    name: party.name,
                    code: party.code,
                    status: party.status,
                    member_count: memberIds.length,
                    host_display_name: host?.display_name ?? 'Unknown',
                    miles_away: parseFloat(closestMiles.toFixed(1)),
                    friends_inside: friendsInside,
                });
            }
        }

        result.sort((a: any, b: any) => {
            if (a.friends_inside !== b.friends_inside) return a.friends_inside ? -1 : 1;
            return a.miles_away - b.miles_away;
        });
        res.json(result);
    } catch (e) {
        next(e);
    }
});

router.post('/likes', requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        const {
            google_place_id, name, address,
            latitude, longitude, photo_url,
            rating, category, price_level,
        } = req.body;
        if (!google_place_id || !name) throw new HttpError(400, 'missing_required_fields');

        const { error } = await supabaseAdmin
            .from('discover_likes')
            .upsert(
                {
                    user_id: req.user!.id,
                    google_place_id,
                    name,
                    address: address ?? null,
                    latitude: latitude ?? null,
                    longitude: longitude ?? null,
                    photo_url: photo_url ?? null,
                    rating: rating ?? null,
                    category: category ?? null,
                    price_level: price_level ?? null,
                },
                { onConflict: 'user_id,google_place_id' },
            );
        if (error) throw new HttpError(500, 'like_failed', error.message);
        res.json({ ok: true });
    } catch (e) { next(e); }
});

router.delete('/likes/:place_id', requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        const { error } = await supabaseAdmin
            .from('discover_likes')
            .delete()
            .eq('user_id', req.user!.id)
            .eq('google_place_id', req.params.place_id);
        if (error) throw new HttpError(500, 'unlike_failed', error.message);
        res.json({ ok: true });
    } catch (e) { next(e); }
});

router.get('/pitch', requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        const q = req.query as Record<string, string>;
        const { name, category, rating, price_level, address, user_ratings_total } = q;
        if (!name) throw new HttpError(400, 'missing_name');
        const result = await generateVenuePitch(
            {
                name,
                category: category ?? null,
                rating: rating ? parseFloat(rating) : null,
                price_level: price_level ? parseInt(price_level, 10) : null,
                address: address ?? null,
                user_ratings_total: user_ratings_total ? parseInt(user_ratings_total, 10) : null,
            },
            { member_count: 1 },
        );
        res.json(result);
    } catch (e) { next(e); }
});

router.get('/likes', requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        const { data, error } = await supabaseAdmin
            .from('discover_likes')
            .select('*')
            .eq('user_id', req.user!.id)
            .order('liked_at', { ascending: false });
        if (error) throw new HttpError(500, 'fetch_likes_failed', error.message);
        res.json(data ?? []);
    } catch (e) { next(e); }
});

router.get('/places/search', requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        const q = (req.query.q as string | undefined)?.trim();
        if (!q) throw new HttpError(400, 'missing_query');

        const lat = req.query.lat ? parseFloat(req.query.lat as string) : null;
        const lng = req.query.lng ? parseFloat(req.query.lng as string) : null;

        const body: any = { textQuery: q, maxResultCount: 10 };
        if (lat != null && lng != null) {
            body.locationBias = {
                circle: { center: { latitude: lat, longitude: lng }, radius: 25000 },
            };
        }

        const response = await axios.post(
            'https://places.googleapis.com/v1/places:searchText',
            body,
            {
                headers: {
                    'X-Goog-Api-Key': config.google.mapsApiKey,
                    'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location',
                    'Content-Type': 'application/json',
                },
            }
        );

        const places = (response.data.places ?? []).map((p: any) => ({
            google_place_id: p.id,
            name: p.displayName?.text ?? '',
            address: p.formattedAddress ?? '',
            latitude: p.location?.latitude ?? null,
            longitude: p.location?.longitude ?? null,
        }));

        res.json(places);
    } catch (e: any) {
        if (e instanceof HttpError) return next(e);
        next(new HttpError(500, 'places_search_failed', e?.message));
    }
});

export default router;
