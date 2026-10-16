import axios from 'axios';
import { config } from '../config';
import { LatLng } from './midpoint';
import { HttpError, isGoogleQuotaError, venueLimitReached } from '../middleware/error';
import { cached, geocodeKey, gridCell, nearbyKey, normalizeQuery } from './googleCache';

export interface PlaceCandidate {
    google_place_id: string;
    name: string;
    address: string;
    latitude: number;
    longitude: number;
    photo_url: string | null;
    rating: number | null;
    user_ratings_total: number | null;
    category: string | null;
    price_level: number | null;
}

const PLACES_NEARBY_URL = 'https://places.googleapis.com/v1/places:searchNearby';

const INCLUDED_TYPES = [
    'restaurant', 'cafe', 'bar', 'bakery',
    'park', 'tourist_attraction', 'museum', 'art_gallery',
    'bowling_alley', 'movie_theater', 'amusement_park', 'aquarium', 'zoo',
    'gym', 'yoga_studio',
    'shopping_mall', 'book_store',
    'night_club',
];

const PLACE_FIELDS = [
    'id',
    'displayName',
    'formattedAddress',
    'location',
    'rating',
    'userRatingCount',
    'priceLevel',
    'photos',
    'primaryType',
    'types',
];
const FIELD_MASK = PLACE_FIELDS.map((f) => `places.${f}`).join(',');
const DETAILS_FIELD_MASK = PLACE_FIELDS.join(',');
const PLACE_ID_RE = /^[A-Za-z0-9_-]{1,256}$/;

function toCandidate(p: any): PlaceCandidate {
    const photoName = p.photos?.[0]?.name as string | undefined;
    return {
        google_place_id: p.id,
        name: p.displayName?.text ?? 'Unknown',
        address: p.formattedAddress ?? '',
        latitude: p.location?.latitude ?? 0,
        longitude: p.location?.longitude ?? 0,
        photo_url: photoName ? `/api/photo?name=${encodeURIComponent(photoName)}` : null,
        rating: p.rating ?? null,
        user_ratings_total: p.userRatingCount ?? null,
        category: humanizeCategory(p.primaryType ?? null),
        price_level: priceLevelToInt(p.priceLevel),
    };
}

const DETAILS_TTL_MS = 15 * 60_000;
export const DETAILS_CACHE_MAX = 500;
const detailsCache = new Map<string, { venue: PlaceCandidate; expiresAt: number }>();

function rememberDetails(venue: PlaceCandidate): PlaceCandidate {
    detailsCache.delete(venue.google_place_id);
    if (detailsCache.size >= DETAILS_CACHE_MAX) detailsCache.delete(detailsCache.keys().next().value!);
    detailsCache.set(venue.google_place_id, { venue, expiresAt: Date.now() + DETAILS_TTL_MS });
    return venue;
}

async function placeDetails(id: string): Promise<PlaceCandidate | null> {
    const hit = detailsCache.get(id);
    if (hit && hit.expiresAt > Date.now()) return hit.venue;
    const venue = await fetchDetails(id);
    return venue && rememberDetails(venue);
}

async function fetchDetails(id: string): Promise<PlaceCandidate | null> {
    if (!PLACE_ID_RE.test(id)) return null;
    try {
        const res = await axios.get(`https://places.googleapis.com/v1/places/${id}`, {
            headers: { 'X-Goog-Api-Key': config.google.mapsApiKey, 'X-Goog-FieldMask': DETAILS_FIELD_MASK },
            timeout: 10_000,
        });
        return res.data?.id ? toCandidate(res.data) : null;
    } catch (e: any) {
        if (isGoogleQuotaError(e)) throw e;
        console.error('[place-details] lookup failed:', e?.response?.status ?? e?.message);
        return null;
    }
}

async function fetchNearby(center: LatLng, radiusMeters: number, includedTypes: string[]): Promise<PlaceCandidate[]> {
    const body = {
        includedTypes,
        maxResultCount: 20,
        locationRestriction: {
            circle: {
                center: { latitude: center.latitude, longitude: center.longitude },
                radius: radiusMeters,
            },
        },
        rankPreference: 'POPULARITY',
    };

    const res = await axios.post(PLACES_NEARBY_URL, body, {
        headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': config.google.mapsApiKey,
            'X-Goog-FieldMask': FIELD_MASK,
        },
        timeout: 10_000,
    });

    const places = ((res.data?.places ?? []) as any[]).filter((p) =>
        isAcceptableVenueType({
            name: p.displayName?.text ?? '',
            primaryType: p.primaryType ?? null,
            types: (p.types as string[] | undefined) ?? [],
        }),
    );

    return places.map(toCandidate);
}

async function cachedNearby(
    center: LatLng,
    radiusMeters: number,
    types: string[],
    page: number | 'base',
    pick: (ids: string[]) => string[],
): Promise<{ venues: PlaceCandidate[]; stale: boolean }> {
    const cell = gridCell(center);
    const radius = Math.max(1, Math.round(radiusMeters / 1000)) * 1000;
    const { value, stale } = await cached('nearby', nearbyKey(cell, radius, types, page), async () => {
        const ids = (await fetchNearby(cell, radius, types)).map((v) => rememberDetails(v).google_place_id);
        return ids.length ? { ids } : null;
    });
    const results = await Promise.allSettled(pick(value?.ids ?? []).map(placeDetails));
    const venues = results.flatMap((r) => (r.status === 'fulfilled' && r.value ? [r.value] : []));
    const failure = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
    if (!venues.length && failure) throw failure.reason;
    return { venues, stale };
}

export async function searchNearbyVenues(
    center: LatLng,
    radiusMeters = 5000,
    maxResults = 15,
): Promise<PlaceCandidate[] & { cached?: true }> {
    const { venues, stale } = await cachedNearby(center, radiusMeters, INCLUDED_TYPES, 'base', (ids) => ids.slice(0, maxResults));
    return stale ? Object.assign(venues, { cached: true as const }) : venues;
}

function humanizeCategory(t: string | null): string | null {
    if (!t) return null;
    return t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function priceLevelToInt(level: any): number | null {
    const map: Record<string, number> = {
        PRICE_LEVEL_FREE: 0,
        PRICE_LEVEL_INEXPENSIVE: 1,
        PRICE_LEVEL_MODERATE: 2,
        PRICE_LEVEL_EXPENSIVE: 3,
        PRICE_LEVEL_VERY_EXPENSIVE: 4,
    };
    if (typeof level === 'string' && level in map) return map[level];
    if (typeof level === 'number') return level;
    return null;
}

const BLOCKED_PRIMARY_TYPES = new Set([
    'supermarket', 'grocery_store', 'convenience_store', 'gas_station',
    'department_store', 'hardware_store', 'pharmacy', 'drugstore',
    'car_dealer', 'car_repair', 'storage', 'wholesaler',
    'moving_company', 'bank', 'atm', 'post_office', 'laundry',
]);

const BLOCKED_NAME_FRAGMENTS = [
    'wholesale', 'costco', 'bj\'s', 'sam\'s club', 'shoprite', 'whole foods',
    'trader joe', 'walmart', 'target', 'cvs pharmacy', 'walgreens', 'rite aid',
];

export function isAcceptableVenueType(venue: {
    name: string;
    primaryType?: string | null;
    types?: string[] | null;
}): boolean {
    return !isBlockedVenue({
        name: venue.name,
        primaryType: venue.primaryType ?? null,
        types: venue.types ?? [],
        displayName: venue.name ? { text: venue.name } : undefined,
    });
}

export function isBlockedVenue(p: any): boolean {
    const primary: string = (p.primaryType ?? p.primary_type ?? '').toLowerCase();
    if (BLOCKED_PRIMARY_TYPES.has(primary)) return true;

    const types: string[] = (p.types ?? []).map((t: string) => t.toLowerCase());
    if (types.some((t) => BLOCKED_PRIMARY_TYPES.has(t))) return true;

    const name: string = (p.name ?? p.displayName?.text ?? '').toLowerCase();
    if (BLOCKED_NAME_FRAGMENTS.some((frag) => name.includes(frag))) return true;

    return false;
}

// Rotation buckets for load-more calls. Food is last to avoid front-loading it.
export const ROTATION_TYPES: string[][] = [
    ['museum', 'art_gallery', 'library', 'tourist_attraction'],
    ['park', 'national_park'],
    ['bowling_alley', 'movie_theater', 'amusement_park', 'night_club', 'aquarium', 'zoo'],
    ['gym', 'fitness_center', 'shopping_mall', 'book_store'],
    ['restaurant', 'cafe', 'bar', 'bakery'],
];
export const ROTATION_COUNT = ROTATION_TYPES.length;

export interface VenueRotationParams {
    center: LatLng;
    baseRadiusMeters?: number;
    rotationSeed?: number;
    excludeIds?: Set<string>;
}

export interface VenueRotationResult {
    venues: PlaceCandidate[];
    nextPageToken: string | null;
    newSeed: number;
    exhausted: boolean;
    limited?: boolean;
    cached?: true;
}

export async function getVenuesWithRotation(params: VenueRotationParams): Promise<VenueRotationResult> {
    const {
        center,
        baseRadiusMeters = 8000,
        rotationSeed = 0,
        excludeIds = new Set<string>(),
    } = params;

    if (rotationSeed >= ROTATION_COUNT) {
        return { venues: [], nextPageToken: null, newSeed: rotationSeed, exhausted: true };
    }

    const radiusMeters = Math.min(baseRadiusMeters + rotationSeed * 3000, 25_000);
    const rotationTypes = ROTATION_TYPES[rotationSeed];

    let fresh: PlaceCandidate[];
    let stale = false;
    try {
        ({ venues: fresh, stale } = await cachedNearby(center, radiusMeters, rotationTypes, rotationSeed, (ids) =>
            ids.filter((id) => !excludeIds.has(id)),
        ));
    } catch (e: any) {
        if (e instanceof HttpError) throw e;
        console.error('[venues-rotation] Places API error:', e?.response?.data ?? e?.message);
        if (isGoogleQuotaError(e)) return { venues: [], nextPageToken: null, newSeed: rotationSeed, exhausted: false, limited: true };
        return { venues: [], nextPageToken: null, newSeed: rotationSeed + 1, exhausted: rotationSeed + 1 >= ROTATION_COUNT };
    }

    console.log('[venues-rotation] after dedup:', fresh.length);

    // New Places API has no next_page_token for searchNearby — always advance rotation
    const newSeed = rotationSeed + 1;
    const exhausted = newSeed >= ROTATION_COUNT && fresh.length === 0;

    return { venues: fresh, nextPageToken: null, newSeed, exhausted, ...(stale && { cached: true as const }) };
}

/** Alias — shared venue pool helper for party + discover load-more. */
export const getNearbyVenues = getVenuesWithRotation;

// Forward geocoding for the manual city fallback
export async function geocodeCity(city: string, country?: string): Promise<(LatLng & { label: string }) | null> {
    const q = (country ? `${city}, ${country}` : city).trim();
    const fetched: { place?: LatLng & { label: string } } = {};
    const { value } = await cached('geocode', geocodeKey(q), async () => {
        const place = await fetchGeocode(q);
        if (!place) return null;
        fetched.place = place;
        return { latitude: place.latitude, longitude: place.longitude, label: Array.from(normalizeQuery(q)).slice(0, 120).join('') };
    });
    return fetched.place ?? value;
}

async function fetchGeocode(q: string): Promise<(LatLng & { label: string }) | null> {
    const url = 'https://maps.googleapis.com/maps/api/geocode/json';
    const res = await axios.get(url, {
        params: { address: q, key: config.google.mapsApiKey },
        timeout: 10_000,
    });
    if (['OVER_QUERY_LIMIT', 'OVER_DAILY_LIMIT'].includes(res.data?.status)) throw venueLimitReached();
    const result = res.data?.results?.[0];
    if (!result) return null;
    const loc = result.geometry?.location;
    if (typeof loc?.lat !== 'number' || typeof loc?.lng !== 'number') return null;
    return { latitude: loc.lat, longitude: loc.lng, label: String(result.formatted_address || q).slice(0, 120) };
}
