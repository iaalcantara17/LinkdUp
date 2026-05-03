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
        username?: string;
        theme_preference?: 'dark' | 'light' | 'system';
    }) => request<any>('PATCH', '/api/user/me', b),
    checkUsernameAvailable: (u: string) =>
        request<{ available: boolean; valid: boolean; reason?: string }>(
            'GET', `/api/user/username-available?u=${encodeURIComponent(u)}`
        ),
    getPublicUser: (userId: string) => request<any>('GET', `/api/user/${userId}/public`),
    myParties: () => request<any[]>('GET', '/api/user/me/parties'),
    myHangouts: () => request<any[]>('GET', '/api/user/me/hangouts'),

    schools: (q = '') => request<Array<{ id: string; name: string; city: string; state: string }>>(
        'GET', `/api/schools?q=${encodeURIComponent(q)}`
    ),
    getSchool: (id: string) => request<{ id: string; name: string; city: string; state: string }>(
        'GET', `/api/schools/${id}`
    ),
    lookupSchool: (name: string) => request<{ id: string; name: string; city?: string; state?: string }>(
        'POST', '/api/schools/lookup', { name }
    ),

    updateAvatar: (image_base64: string) =>
        request<{ ok: boolean; avatar_url: string }>('PUT', '/api/user/me/avatar', { image_base64 }),
    updateLocation: (lat: number, lng: number) =>
        request<any>('PUT', '/api/user/location', { latitude: lat, longitude: lng }),
    updateLocationManual: (city: string, country?: string) =>
        request<any>('PUT', '/api/user/location/manual', { city, country }),

    createParty: (name?: string, isPublic?: boolean) =>
        request<{ party_id: string; code: string }>('POST', '/api/party', { name, is_public: isPublic ?? false }),
    joinParty: (code: string) => request<{ party_id: string }>('POST', '/api/party/join', { code }),
    getParty: (id: string) => request<any>('GET', `/api/party/${id}`),
    getMembers: (id: string) => request<any[]>('GET', `/api/party/${id}/members`),
    startParty: (id: string) => request<any>('POST', `/api/party/${id}/start`),
    resetParty: (id: string) => request<any>('POST', `/api/party/${id}/reset`),
    leaveParty: (id: string) => request<{ ok: boolean }>('DELETE', `/api/party/${id}/leave`),
    deleteParty: (id: string) => request<{ ok: boolean }>('DELETE', `/api/party/${id}`),
    updatePartyVisibility: (partyId: string, isPublic: boolean) =>
        request<{ ok: boolean; is_public: boolean }>('PATCH', `/api/party/${partyId}/visibility`, { is_public: isPublic }),
    getLocations: (id: string) => request<any[]>('GET', `/api/party/${id}/locations`),
    getVenuePitch: (partyId: string, venueId: string) =>
        request<{ pitch: string }>('GET', `/api/party/${partyId}/pitch?venue_id=${venueId}`),

    vote: (partyId: string, locationId: string, vote: boolean) =>
        request<any>('POST', `/api/party/${partyId}/vote`, { location_id: locationId, vote }),
    getVotes: (partyId: string) => request<any[]>('GET', `/api/party/${partyId}/votes`),
    getMyVotes: (partyId: string) => request<Array<{ location_id: string }>>('GET', `/api/party/${partyId}/my-votes`),

    getMatch: (partyId: string) => request<any>('GET', `/api/party/${partyId}/match`),
    forceMatch: (partyId: string) => request<any>('POST', `/api/party/${partyId}/force-match`),
    markWalkthroughSeen: () => request<any>('POST', '/api/user/me/walkthrough-seen'),
    setLocationPermission: (status: 'granted' | 'maybe_later') =>
        request<any>('POST', '/api/user/me/location-permission', { status }),
    revokeLocation: () => request<{ ok: boolean }>('DELETE', '/api/user/me/location'),
    getSeenHints: () => request<string[]>('GET', '/api/user/me/hints'),
    markHintSeen: (screenKey: string) => request<any>('POST', '/api/user/me/hints', { screen_key: screenKey }),

    generateDates: (partyId: string) => request<any>('POST', `/api/party/${partyId}/dates`),
    getDates: (partyId: string) => request<any[]>('GET', `/api/party/${partyId}/dates`),
    proposeDate: (partyId: string, proposedDate: string, timeSlot?: string) =>
        request<any>('POST', `/api/party/${partyId}/dates`, {
            proposed_date: proposedDate,
            ...(timeSlot ? { time_slot: timeSlot } : {}),
        }),
    voteOnDate: (partyId: string, dateId: string, available: boolean) =>
        request<any>('POST', `/api/party/${partyId}/dates/${dateId}/vote`, { available }),
    lockDateById: (partyId: string, dateId: string) =>
        request<any>('POST', `/api/party/${partyId}/dates/${dateId}/lock`),
    deleteProposedDate: (partyId: string, dateId: string) =>
        request<{ ok: boolean }>('DELETE', `/api/party/${partyId}/dates/${dateId}`),
    voteDates: (partyId: string, ids: string[]) =>
        request<any>('POST', `/api/party/${partyId}/dates/vote`, { date_slot_ids: ids }),
    lockDate: (partyId: string, id: string) =>
        request<any>('POST', `/api/party/${partyId}/dates/lock`, { party_date_id: id }),
    createCustomDate: (partyId: string, datetime: string) =>
        request<{ id: string; starts_at: string; ends_at: string }>(
            'POST', `/api/party/${partyId}/dates/custom`, { datetime }
        ),

    calendarOAuthStart: () => request<{ url: string }>('GET', '/api/calendar/oauth/start'),
    calendarExport: (partyId: string) => request<any>('POST', `/api/calendar/party/${partyId}/export`),

    loadMoreVenues: (partyId: string) =>
        request<{ new_venue_count: number; exhausted?: boolean }>('GET', `/api/party/${partyId}/more-venues`),

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

    getFeed: (opts?: { limit?: number; after?: string; lat?: number; lng?: number }) => {
        const params = new URLSearchParams();
        if (opts?.limit) params.set('limit', String(opts.limit));
        if (opts?.after) params.set('after', opts.after);
        if (opts?.lat != null) params.set('lat', String(opts.lat));
        if (opts?.lng != null) params.set('lng', String(opts.lng));
        const qs = params.toString();
        return request<{ posts: any[]; has_more: boolean; next_cursor: string | null }>(
            'GET', `/api/discover/feed${qs ? '?' + qs : ''}`
        );
    },

    getUploadUrl: (ext = 'jpg') =>
        request<{ upload_url: string; public_url: string; file_path: string }>(
            'POST', '/api/discover/feed/upload-url', { ext }
        ),
    uploadFeedPhoto: async (file: Blob | File): Promise<string> => {
        const ext = (file as File).name?.split('.').pop() ?? 'jpg';
        const { upload_url, public_url } = await api.getUploadUrl(ext);
        const res = await fetch(upload_url, {
            method: 'PUT',
            headers: { 'Content-Type': file.type || 'image/jpeg' },
            body: file,
        });
        if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
        return public_url;
    },
    createFeedPost: (b: {
        image_url: string;
        caption?: string;
        venue_name: string;
        venue_address?: string;
        venue_lat?: number;
        venue_lng?: number;
        venue_google_place_id?: string;
    }) => request<any>('POST', '/api/discover/feed/posts', {
        image_url: b.image_url,
        caption: b.caption ?? null,
        venue_name: b.venue_name,
        venue_address: b.venue_address ?? null,
        venue_latitude: b.venue_lat ?? null,
        venue_longitude: b.venue_lng ?? null,
        venue_google_place_id: b.venue_google_place_id ?? null,
    }),

    likeFeedPost: (postId: string) =>
        request<{ ok: boolean }>('POST', `/api/discover/feed/posts/${postId}/like`),
    unlikeFeedPost: (postId: string) =>
        request<{ ok: boolean }>('DELETE', `/api/discover/feed/posts/${postId}/like`),

    bookmarkFeedPost: (postId: string, collectionId?: string | null) =>
        request<{ ok: boolean }>('POST', `/api/discover/feed/posts/${postId}/bookmark`, {
            collection_id: collectionId ?? null,
        }),
    unbookmarkFeedPost: (postId: string) =>
        request<{ ok: boolean }>('DELETE', `/api/discover/feed/posts/${postId}/bookmark`),

    getFeedComments: (postId: string) =>
        request<any[]>('GET', `/api/discover/feed/posts/${postId}/comments`),
    addFeedComment: (postId: string, body: string) =>
        request<any>('POST', `/api/discover/feed/posts/${postId}/comments`, { body }),
    deleteFeedComment: (commentId: string) =>
        request<{ ok: boolean }>('DELETE', `/api/discover/feed/comments/${commentId}`),

    followUser: (userId: string) =>
        request<{ ok: boolean }>('POST', `/api/user/${userId}/follow`),
    unfollowUser: (userId: string) =>
        request<{ ok: boolean }>('DELETE', `/api/user/${userId}/follow`),

    getFollowCounts: (userId: string) =>
        request<{ followers: number; following: number }>('GET', `/api/user/${userId}/follow-counts`),
    getFollowers: (userId: string, opts?: { limit?: number; before?: string }) => {
        const params = new URLSearchParams();
        if (opts?.limit) params.set('limit', String(opts.limit));
        if (opts?.before) params.set('before', opts.before);
        const qs = params.toString() ? '?' + params.toString() : '';
        return request<any[]>('GET', `/api/user/${userId}/followers${qs}`);
    },
    getFollowing: (userId: string, opts?: { limit?: number; before?: string }) => {
        const params = new URLSearchParams();
        if (opts?.limit) params.set('limit', String(opts.limit));
        if (opts?.before) params.set('before', opts.before);
        const qs = params.toString() ? '?' + params.toString() : '';
        return request<any[]>('GET', `/api/user/${userId}/following${qs}`);
    },
    removeFollower: (userId: string) =>
        request<{ ok: boolean }>('DELETE', `/api/user/me/followers/${userId}`),
    blockUser: (userId: string) =>
        request<{ blocked: boolean }>('POST', `/api/user/${userId}/block`),
    unblockUser: (userId: string) =>
        request<{ ok: boolean }>('DELETE', `/api/user/${userId}/block`),
    getBlockedUsers: () =>
        request<any[]>('GET', '/api/user/me/blocked'),

    editFeedPost: (postId: string, caption: string | null) =>
        request<{ ok: boolean }>('PATCH', `/api/discover/feed/posts/${postId}`, { caption }),

    deleteFeedPost: (postId: string) =>
        request<{ ok: boolean }>('DELETE', `/api/discover/feed/posts/${postId}`),

    getMyPosts: () =>
        request<{ posts: any[] }>('GET', '/api/discover/feed/my-posts'),

    getCollections: () =>
        request<Array<{ id: string; name: string; created_at: string }>>('GET', '/api/discover/feed/collections'),
    createCollection: (name: string) =>
        request<{ id: string; name: string; created_at: string }>('POST', '/api/discover/feed/collections', { name }),
    deleteCollection: (collectionId: string) =>
        request<{ ok: boolean }>('DELETE', `/api/discover/feed/collections/${collectionId}`),
    getSavedPosts: (collectionId?: string | null) => {
        const params = new URLSearchParams();
        if (collectionId != null) params.set('collection_id', collectionId);
        const qs = params.toString() ? `?${params.toString()}` : '';
        return request<{ posts: any[] }>('GET', `/api/discover/feed/saved${qs}`);
    },

    addPostVenueToParty: (postId: string, partyId: string) =>
        request<{ added: boolean; location_id: string }>(
            'POST', `/api/discover/feed/posts/${postId}/add-to-party`, { party_id: partyId }
        ),

    searchPlaces: (q: string, lat?: number, lng?: number) => {
        const params = new URLSearchParams({ q });
        if (lat != null) params.set('lat', String(lat));
        if (lng != null) params.set('lng', String(lng));
        return request<Array<{ google_place_id: string; name: string; address: string; latitude: number | null; longitude: number | null }>>(
            'GET', `/api/discover/places/search?${params.toString()}`
        );
    },

    deleteAccount: () => request<{ ok: boolean }>('DELETE', '/api/user/me'),

    respondToProposal: (partyId: string, accepted: boolean) =>
        request<{ ok: boolean }>('POST', `/api/party/${partyId}/proposal/respond`, { accepted }),

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
