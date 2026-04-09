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

    // Schools
    schools: (q = '') => request<Array<{ id: string; name: string; city: string; state: string }>>(
        'GET', `/api/schools?q=${encodeURIComponent(q)}`
    ),

    // User
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
    getLocations: (id: string) => request<any[]>('GET', `/api/party/${id}/locations`),

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

    // Calendar
    calendarOAuthStart: () => request<{ url: string }>('GET', '/api/calendar/oauth/start'),
    calendarExport: (partyId: string) => request<any>('POST', `/api/calendar/party/${partyId}/export`),
};
