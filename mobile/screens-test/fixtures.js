export const party = { id: 'p1', name: 'Friday Crew', code: 'ABC234', status: 'waiting', host_user_id: 'alice', midpoint_lat: null, midpoint_lng: null, locked_date_id: 'd1', current_card_index: 0, voting_round: 1 };

const users = {
    alice: { id: 'alice', display_name: 'Alice', avatar_color: '#6C3EF4', avatar_url: null },
    bob: { id: 'bob', display_name: 'Bob', avatar_color: '#22C55E', avatar_url: null },
};

export const members = [
    { user_id: 'alice', joined_at: '2026-10-16T10:00:00Z', is_online: true, users: users.alice, display_lat: 40.74, display_lng: -74.03 },
    { user_id: 'bob', joined_at: '2026-10-16T10:01:00Z', is_online: true, users: users.bob, display_lat: null, display_lng: null },
];

export const myParties = [
    { id: 'p1', name: 'Friday Crew', status: 'waiting', member_count: 2, member_avatars: [users.alice, users.bob], total_votes: 0, venue_count: 0, my_location: { mode: 'live', custom_label: null, live_fresh: true } },
];

export const friends = [
    { id: 'bob', display_name: 'Bob Builder', username: 'bob', avatar_color: '#22C55E', avatar_url: null, is_online: true },
];

export const locations = [
    { id: 'l1', party_id: 'p1', google_place_id: 'g1', name: 'Blue Bottle Cafe', address: '1 Main St', latitude: 40.74, longitude: -74.03, photo_url: null, rating: 4.6, user_ratings_total: 120, category: 'Cafe', price_level: 2, created_at: '2026-10-16T10:05:00Z', distances: [] },
    { id: 'l2', party_id: 'p1', google_place_id: 'g2', name: 'Pier Park', address: '2 River Rd', latitude: 40.75, longitude: -74.02, photo_url: null, rating: 4.4, user_ratings_total: 80, category: 'Park', price_level: null, created_at: '2026-10-16T10:05:00Z', distances: [] },
];

export const profile = {
    id: 'alice', email: 'alice@test.dev', display_name: 'Alice Liddell', username: 'alice', school_id: null, graduation_year: 2026,
    avatar_color: '#6C3EF4', avatar_url: null, latitude: null, longitude: null, has_seen_walkthrough: true,
    location_permission_status: 'granted', pronouns: 'she/her', birthday: null, bio: 'Coffee first', theme_preference: 'dark',
    google_calendar_connected: false, age: 22,
};

export const venues = [
    { google_place_id: 'g9', name: 'Hudson Taproom', address: '9 Hudson St', latitude: 40.74, longitude: -74.03, photo_url: null, rating: 4.3, user_ratings_total: 50, category: 'Bar', price_level: 2, distance_miles: 0.4 },
];

export const popularSpots = [
    { google_place_id: 'demo-harbor-light', name: 'Harbor Light Cafe (demo)', address: '100 River St, Hoboken, NJ 07030', latitude: 40.7372, longitude: -74.029, photo_url: '/demo/venue-harbor-light.jpg', rating: 4.6, user_ratings_total: 412, category: 'Cafe', price_level: 1, distance_miles: 0.3, fallback: true },
    { google_place_id: 'demo-copper-kettle', name: 'Copper Kettle (demo)', address: '220 Washington St, Hoboken, NJ 07030', latitude: 40.7395, longitude: -74.0305, photo_url: '/demo/venue-copper-kettle.jpg', rating: 4.5, user_ratings_total: 838, category: 'Breakfast & brunch', price_level: 2, distance_miles: 0.2, fallback: true },
];

export function routes(byName) {
    return (name) => {
        const value = byName[name];
        if (value instanceof Error) return Promise.reject(value);
        return Promise.resolve(typeof value === 'function' ? value() : value ?? null);
    };
}
