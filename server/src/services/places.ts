import axios from 'axios';
import { config } from '../config';
import { LatLng } from './midpoint';

export interface PagedVenueResult {
    venues: PlaceCandidate[];
    nextPageToken: string | null;
}

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

export async function searchNearbyVenues(center: LatLng, radiusMeters = 5000, maxResults = 15): Promise<PlaceCandidate[]> {
    const body = {
        includedTypes: INCLUDED_TYPES,
        maxResultCount: Math.min(maxResults, 20),
        locationRestriction: {
            circle: {
                center: { latitude: center.latitude, longitude: center.longitude },
                radius: radiusMeters,
            },
        },
        rankPreference: 'POPULARITY',
    };

    const fieldMask = [
        'places.id',
        'places.displayName',
        'places.formattedAddress',
        'places.location',
        'places.rating',
        'places.userRatingCount',
        'places.priceLevel',
        'places.photos',
        'places.primaryType',
        'places.types',
    ].join(',');

    const res = await axios.post(PLACES_NEARBY_URL, body, {
        headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': config.google.mapsApiKey,
            'X-Goog-FieldMask': fieldMask,
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

    const out: PlaceCandidate[] = [];
    for (const p of places.slice(0, maxResults)) {
        const name = p.displayName?.text ?? 'Unknown';
        const photoName = p.photos?.[0]?.name as string | undefined;
        const photoUrl = photoName
            ? `https://places.googleapis.com/v1/${photoName}/media?maxHeightPx=800&key=${config.google.mapsApiKey}`
            : null;
        out.push({
            google_place_id: p.id,
            name,
            address: p.formattedAddress ?? '',
            latitude: p.location?.latitude ?? 0,
            longitude: p.location?.longitude ?? 0,
            photo_url: photoUrl,
            rating: p.rating ?? null,
            user_ratings_total: p.userRatingCount ?? null,
            category: humanizeCategory(p.primaryType ?? null),
            price_level: priceLevelToInt(p.priceLevel),
        });
    }
    return out;
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

// The new Places API has no pagination; the legacy API is used only to seed
// next_page_token on party start and discover initial load.
const NEARBY_SEARCH_LEGACY_URL = 'https://maps.googleapis.com/maps/api/place/nearbysearch/json';

// Rotation buckets for load-more calls. Food is last to avoid front-loading it.
export const ROTATION_TYPES: string[][] = [
    ['museum', 'art_gallery', 'library', 'tourist_attraction'],
    ['park', 'national_park'],
    ['bowling_alley', 'movie_theater', 'amusement_park', 'night_club', 'aquarium', 'zoo'],
    ['gym', 'fitness_center', 'shopping_mall', 'book_store'],
    ['restaurant', 'cafe', 'bar', 'bakery'],
];
export const ROTATION_COUNT = ROTATION_TYPES.length;

const DEFAULT_LEGACY_KEYWORDS = [
    'restaurant', 'cafe', 'bar', 'park',
    'tourist_attraction', 'bowling_alley', 'movie_theater',
    'night_club', 'amusement_park', 'art_gallery', 'museum',
];

export async function searchNearbyVenuesPaged(
    center: LatLng,
    radiusMeters = 5000,
    pageToken?: string,
    keywords?: string[],
): Promise<PagedVenueResult> {
    // Google requires that only key + pagetoken are sent when a pageToken is supplied.
    const params: Record<string, any> = { key: config.google.mapsApiKey };
    if (pageToken) {
        params.pagetoken = pageToken;
    } else {
        const kw = keywords ?? DEFAULT_LEGACY_KEYWORDS;
        params.location = `${center.latitude},${center.longitude}`;
        params.radius = radiusMeters;
        params.type = 'establishment';
        params.keyword = kw.join('|');
    }

    const res = await axios.get(NEARBY_SEARCH_LEGACY_URL, { params, timeout: 10_000 });
    const rawResults = (res.data?.results ?? []) as any[];
    const results = rawResults.filter((p: any) =>
        isAcceptableVenueType({
            name: p.name ?? '',
            primaryType: p.types?.[0] ?? null,
            types: p.types ?? [],
        }),
    );
    const next: string | null = res.data?.next_page_token ?? null;

    const venues = results.map((p: any): PlaceCandidate => {
        const photoRef = p.photos?.[0]?.photo_reference as string | undefined;
        const photo_url = photoRef
            ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${photoRef}&key=${config.google.mapsApiKey}`
            : null;
        return {
            google_place_id: p.place_id,
            name: p.name ?? 'Unknown',
            address: p.vicinity ?? '',
            latitude: p.geometry?.location?.lat ?? 0,
            longitude: p.geometry?.location?.lng ?? 0,
            photo_url,
            rating: p.rating ?? null,
            user_ratings_total: p.user_ratings_total ?? null,
            category: humanizeCategory(p.types?.[0] ?? null),
            price_level: typeof p.price_level === 'number' ? p.price_level : null,
        };
    });

    return { venues, nextPageToken: next };
}

export interface VenueRotationParams {
    center: LatLng;
    baseRadiusMeters?: number;
    pageToken?: string;
    rotationSeed?: number;
    excludeIds?: Set<string>;
}

export interface VenueRotationResult {
    venues: PlaceCandidate[];
    nextPageToken: string | null;
    newSeed: number;
    exhausted: boolean;
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

    const body = {
        includedTypes: rotationTypes,
        maxResultCount: 20,
        locationRestriction: {
            circle: {
                center: { latitude: center.latitude, longitude: center.longitude },
                radius: radiusMeters,
            },
        },
        rankPreference: 'POPULARITY',
    };

    const fieldMask = [
        'places.id',
        'places.displayName',
        'places.formattedAddress',
        'places.location',
        'places.rating',
        'places.userRatingCount',
        'places.priceLevel',
        'places.photos',
        'places.primaryType',
        'places.types',
    ].join(',');

    let rawPlaces: any[] = [];
    try {
        const res = await axios.post(PLACES_NEARBY_URL, body, {
            headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': config.google.mapsApiKey,
                'X-Goog-FieldMask': fieldMask,
            },
            timeout: 10_000,
        });
        rawPlaces = (res.data?.places ?? []) as any[];
        console.log('[venues-rotation] places returned:', rawPlaces.length);
    } catch (e: any) {
        console.error('[venues-rotation] Places API error:', e?.response?.data ?? e?.message);
        return { venues: [], nextPageToken: null, newSeed: rotationSeed + 1, exhausted: rotationSeed + 1 >= ROTATION_COUNT };
    }

    const filtered = rawPlaces.filter((p) =>
        isAcceptableVenueType({
            name: p.displayName?.text ?? '',
            primaryType: p.primaryType ?? null,
            types: (p.types as string[] | undefined) ?? [],
        }),
    );
    console.log('[venues-rotation] after blocked-type filter:', filtered.length);

    const mapped: PlaceCandidate[] = filtered.map((p: any) => {
        const photoName = p.photos?.[0]?.name as string | undefined;
        const photoUrl = photoName
            ? `https://places.googleapis.com/v1/${photoName}/media?maxHeightPx=800&key=${config.google.mapsApiKey}`
            : null;
        return {
            google_place_id: p.id,
            name: p.displayName?.text ?? 'Unknown',
            address: p.formattedAddress ?? '',
            latitude: p.location?.latitude ?? 0,
            longitude: p.location?.longitude ?? 0,
            photo_url: photoUrl,
            rating: p.rating ?? null,
            user_ratings_total: p.userRatingCount ?? null,
            category: humanizeCategory(p.primaryType ?? null),
            price_level: priceLevelToInt(p.priceLevel),
        };
    });

    const fresh = mapped.filter((v) => !excludeIds.has(v.google_place_id));
    console.log('[venues-rotation] after dedup:', fresh.length);

    // New Places API has no next_page_token for searchNearby — always advance rotation
    const newSeed = rotationSeed + 1;
    const exhausted = newSeed >= ROTATION_COUNT && fresh.length === 0;

    return { venues: fresh, nextPageToken: null, newSeed, exhausted };
}

/** Alias — shared venue pool helper for party + discover load-more. */
export const getNearbyVenues = getVenuesWithRotation;

// Forward geocoding for the manual city fallback
export async function geocodeCity(city: string, country?: string): Promise<LatLng | null> {
    const q = country ? `${city}, ${country}` : city;
    const url = 'https://maps.googleapis.com/maps/api/geocode/json';
    const res = await axios.get(url, {
        params: { address: q, key: config.google.mapsApiKey },
        timeout: 10_000,
    });
    const result = res.data?.results?.[0];
    if (!result) return null;
    const loc = result.geometry?.location;
    if (!loc) return null;
    return { latitude: loc.lat, longitude: loc.lng };
}
