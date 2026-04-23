import { supabase } from './supabase';

const BASE = process.env.EXPO_PUBLIC_API_URL!;

async function authHeader(): Promise<Record<string, string>> {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(method: string, path: string, body?: any): Promise<T> {
    const res = await fetch(`${BASE}${path}`, {
        method,
        headers: {
            'Content-Type': 'application/json',
            ...(await authHeader()),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let data: any;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok) {
        const msg = data?.error || data?.message || `HTTP ${res.status}`;
        throw new Error(msg);
    }
    return data as T;
}

export const api = {
    health: () => request<{ ok: boolean }>('GET', '/api/health'),

    // Auth
    signup: (b: { email: string; password: string; display_name: string; school_id?: string; graduation_year?: number }) =>
        request<any>('POST', '/api/auth/signup', b),
    login: (b: { email: string; password: string }) => request<any>('POST', '/api/auth/login', b),
    me: () => request<any>('GET', '/api/auth/me'),
    ensureProfile: (b: { email: string; display_name: string }) =>
        request<any>('POST', '/api/auth/ensure-profile', b),
    updateProfile: (b: {
        display_name?: string;
        graduation_year?: number | null;
        school_id?: string | null;
        avatar_color?: string;
        pronouns?: string | null;
        birthday?: string | null;
        bio?: string | null;
    }) => request<any>('PATCH', '/api/user/me', b),
    getPublicUser: (userId: string) => request<any>('GET', `/api/user/${userId}/public`),
    myParties: () => request<any[]>('GET', '/api/user/me/parties'),
    myHangouts: () => request<any[]>('GET', '/api/user/me/hangouts'),

    // Schools
    schools: (q = '') => request<Array<{ id: string; name: string; city: string; state: string }>>(
        'GET', `/api/schools?q=${encodeURIComponent(q)}`
    ),
    getSchool: (id: string) => request<{ id: string; name: string; city: string; state: string }>(
        'GET', `/api/schools/${id}`
    ),
    lookupSchool: (name: string) => request<{ id: string; name: string; city?: string; state?: string }>(
        'POST', '/api/schools/lookup', { name }
    ),

    // User
    updateAvatar: (image_base64: string) =>
        request<{ ok: boolean; avatar_url: string }>('PUT', '/api/user/me/avatar', { image_base64 }),
    updateLocation: (lat: number, lng: number) =>
        request<any>('PUT', '/api/user/location', { latitude: lat, longitude: lng }),
    updateLocationManual: (city: string, country?: string) =>
        request<any>('PUT', '/api/user/location/manual', { city, country }),

    // Party
    createParty: (name?: string) => request<{ party_id: string; code: string }>('POST', '/api/party', { name }),
    joinParty: (code: string) => request<{ party_id: string }>('POST', '/api/party/join', { code }),
    getParty: (id: string) => request<any>('GET', `/api/party/${id}`),
    getMembers: (id: string) => request<any[]>('GET', `/api/party/${id}/members`),
    startParty: (id: string) => request<any>('POST', `/api/party/${id}/start`),
    resetParty: (id: string) => request<any>('POST', `/api/party/${id}/reset`),
    leaveParty: (id: string) => request<{ ok: boolean }>('DELETE', `/api/party/${id}/leave`),
    deleteParty: (id: string) => request<{ ok: boolean }>('DELETE', `/api/party/${id}`),
    getLocations: (id: string) => request<any[]>('GET', `/api/party/${id}/locations`),
    getVenuePitch: (partyId: string, venueId: string) =>
        request<{ pitch: string }>('GET', `/api/party/${partyId}/pitch?venue_id=${venueId}`),

    // Vote
    vote: (partyId: string, locationId: string, vote: boolean) =>
        request<any>('POST', `/api/party/${partyId}/vote`, { location_id: locationId, vote }),
    getVotes: (partyId: string) => request<any[]>('GET', `/api/party/${partyId}/votes`),

    // Match
    getMatch: (partyId: string) => request<any>('GET', `/api/party/${partyId}/match`),

    // Dates
    generateDates: (partyId: string) => request<any>('POST', `/api/party/${partyId}/dates`),
    getDates: (partyId: string) => request<any[]>('GET', `/api/party/${partyId}/dates`),
    voteDates: (partyId: string, ids: string[]) =>
        request<any>('POST', `/api/party/${partyId}/dates/vote`, { date_slot_ids: ids }),
    lockDate: (partyId: string, id: string) =>
        request<any>('POST', `/api/party/${partyId}/dates/lock`, { party_date_id: id }),
    createCustomDate: (partyId: string, datetime: string) =>
        request<{ id: string; starts_at: string; ends_at: string }>(
            'POST', `/api/party/${partyId}/dates/custom`, { datetime }
        ),

    // Calendar
    calendarOAuthStart: () => request<{ url: string }>('GET', '/api/calendar/oauth/start'),
    calendarExport: (partyId: string) => request<any>('POST', `/api/calendar/party/${partyId}/export`),

    // Party — load more venues
    loadMoreVenues: (partyId: string) =>
        request<{ new_venue_count: number; exhausted?: boolean }>('GET', `/api/party/${partyId}/more-venues`),

    // Discover — venues + parties
    discoverVenues: (lat: number, lng: number) =>
        request<any[]>('GET', `/api/discover/venues?lat=${lat}&lng=${lng}`),
    discoverParties: (lat: number, lng: number) =>
        request<any[]>('GET', `/api/discover/parties?lat=${lat}&lng=${lng}`),
    discoverMoreVenues: (lat: number, lng: number, excludeIds?: string[]) => {
        const ex = (excludeIds ?? []).filter(Boolean);
        const q = ex.length ? `&exclude=${encodeURIComponent(ex.join(','))}` : '';
        return request<{ venues: any[]; hasMore: boolean; exhausted?: boolean; newToken?: boolean }>(
            'GET', `/api/discover/venues/more?lat=${lat}&lng=${lng}${q}`,
        );
    },
    getDiscoverPitch: (venue: {
        name: string;
        category?: string | null;
        rating?: number | null;
        price_level?: number | null;
        address?: string | null;
        user_ratings_total?: number | null;
    }) => {
        const params = new URLSearchParams();
        if (venue.name) params.set('name', venue.name);
        if (venue.category) params.set('category', venue.category);
        if (venue.rating != null) params.set('rating', String(venue.rating));
        if (venue.price_level != null) params.set('price_level', String(venue.price_level));
        if (venue.address) params.set('address', venue.address);
        if (venue.user_ratings_total != null) params.set('user_ratings_total', String(venue.user_ratings_total));
        return request<{ pitch: string }>('GET', `/api/discover/pitch?${params.toString()}`);
    },

    // Discover — personal likes (independent of party/voting)
    likeDiscoverVenue: (venue: {
        google_place_id: string;
        name: string;
        address?: string | null;
        latitude?: number | null;
        longitude?: number | null;
        photo_url?: string | null;
        rating?: number | null;
        category?: string | null;
        price_level?: number | null;
    }) => request<{ ok: boolean }>('POST', '/api/discover/likes', venue),
    unlikeDiscoverVenue: (placeId: string) =>
        request<{ ok: boolean }>('DELETE', `/api/discover/likes/${encodeURIComponent(placeId)}`),
    getDiscoverLikes: () => request<any[]>('GET', '/api/discover/likes'),

    // Account
    deleteAccount: () => request<{ ok: boolean }>('DELETE', '/api/user/me'),

    // Friends
    getFriends: () => request<any[]>('GET', '/api/friends'),
    getPendingRequests: () => request<any[]>('GET', '/api/friends/pending'),
    getOutgoingRequests: () => request<any[]>('GET', '/api/friends/outgoing'),
    sendFriendRequest: (userId: string) => request<{ ok: boolean; friendship_id: string }>('POST', '/api/friends/request', { user_id: userId }),
    acceptFriendRequest: (friendshipId: string) => request<{ ok: boolean }>('POST', `/api/friends/${friendshipId}/accept`),
    declineFriendRequest: (friendshipId: string) => request<{ ok: boolean }>('POST', `/api/friends/${friendshipId}/decline`),
    removeFriend: (userId: string) => request<{ ok: boolean }>('DELETE', `/api/friends/${userId}`),
    searchFriends: (q: string) => request<any[]>('GET', `/api/friends/search?q=${encodeURIComponent(q)}`),
    getFriendStatus: (userId: string) => request<{ status: string; friendship_id?: string; direction?: string }>('GET', `/api/friends/status/${userId}`),
};
