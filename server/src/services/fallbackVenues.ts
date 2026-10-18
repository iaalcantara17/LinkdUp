import type { PlaceCandidate } from './places';

const spot = (slug: string, name: string, address: string, latitude: number, longitude: number, rating: number, reviews: number, category: string, price: number): PlaceCandidate => ({
    google_place_id: `demo-${slug}`,
    name,
    address,
    latitude,
    longitude,
    photo_url: `/demo/venue-${slug}.jpg`,
    rating,
    user_ratings_total: reviews,
    category,
    price_level: price,
});

export const POPULAR_SPOTS: readonly PlaceCandidate[] = [
    spot('harbor-light', 'Harbor Light Cafe (demo)', '100 River St, Hoboken, NJ 07030', 40.7372, -74.0290, 4.6, 412, 'Cafe', 1),
    spot('copper-kettle', 'Copper Kettle (demo)', '220 Washington St, Hoboken, NJ 07030', 40.7395, -74.0305, 4.5, 838, 'Breakfast & brunch', 2),
    spot('riverside-lawn', 'Riverside Lawn (demo)', '500 Sinatra Dr, Hoboken, NJ 07030', 40.7445, -74.0255, 4.7, 1290, 'Park', 0),
    spot('pier-lanes', 'Pier 13 Lanes (demo)', '1300 Sinatra Dr, Hoboken, NJ 07030', 40.7510, -74.0240, 4.3, 356, 'Bowling alley', 2),
    spot('washington-taqueria', 'Washington Taqueria (demo)', '415 Washington St, Hoboken, NJ 07030', 40.7420, -74.0298, 4.4, 627, 'Mexican restaurant', 1),
    spot('hudson-arcade', 'Hudson Arcade (demo)', '78 Newark St, Hoboken, NJ 07030', 40.7368, -74.0318, 4.2, 214, 'Arcade', 2),
    spot('mile-square-pub', 'Mile Square Pub (demo)', '901 Bloomfield St, Hoboken, NJ 07030', 40.7490, -74.0300, 4.4, 503, 'Bar', 2),
    spot('skyline-rooftop', 'Skyline Rooftop (demo)', '1 Newark Ave, Jersey City, NJ 07302', 40.7360, -74.0370, 4.6, 974, 'Rooftop bar', 3),
];

const NAMES = new Set(POPULAR_SPOTS.map((v) => v.name));

export function fallbackVenues(): (PlaceCandidate & { fallback: true })[] {
    return POPULAR_SPOTS.map((v) => ({ ...v, fallback: true as const }));
}

export function isFallbackVenueName(name: string): boolean {
    return NAMES.has(name);
}
