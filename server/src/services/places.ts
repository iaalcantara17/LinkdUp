import axios from 'axios';
import { config } from '../config';
import { LatLng } from './midpoint';

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

// Categories we want to surface. The Places API (New) uses includedTypes.
const INCLUDED_TYPES = [
    'restaurant',
    'cafe',
    'bar',
    'park',
    'tourist_attraction',
    'bowling_alley',
    'movie_theater',
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
    ].join(',');

    const res = await axios.post(PLACES_NEARBY_URL, body, {
        headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': config.google.mapsApiKey,
            'X-Goog-FieldMask': fieldMask,
        },
        timeout: 10_000,
    });

    const places = (res.data?.places ?? []) as any[];

    return places.slice(0, maxResults).map((p): PlaceCandidate => {
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
