import type { LatLng } from './midpoint';
import { fuzzCoords } from './locationFuzz';

export const LIVE_MAX_AGE_MS = 3 * 60 * 60 * 1000;

export interface MemberLocationRow {
    live_latitude?: number | null;
    live_longitude?: number | null;
    live_at?: string | null;
    custom_latitude?: number | null;
    custom_longitude?: number | null;
    custom_label?: string | null;
    location_mode?: string | null;
}

const point = (latitude: unknown, longitude: unknown): LatLng | null =>
    typeof latitude === 'number' && typeof longitude === 'number' && Number.isFinite(latitude) && Number.isFinite(longitude)
        ? { latitude, longitude }
        : null;

export const MEMBER_LOCATION_COLUMNS = 'live_latitude, live_longitude, live_at, custom_latitude, custom_longitude, custom_label, location_mode';

export function myLocationView(row: MemberLocationRow | null | undefined, now = Date.now()) {
    return {
        mode: row?.location_mode === 'custom' ? 'custom' : 'live',
        custom_label: row?.custom_label ?? null,
        live_fresh: now - Date.parse(row?.live_at ?? '') <= LIVE_MAX_AGE_MS,
    };
}

export function effectiveLocation(row: MemberLocationRow | null | undefined, now = Date.now(), maxAgeMs = LIVE_MAX_AGE_MS): LatLng | null {
    if (!row) return null;
    const custom = point(row.custom_latitude, row.custom_longitude);
    const liveAt = Date.parse(row.live_at ?? '');
    const live = now - liveAt <= maxAgeMs ? point(row.live_latitude, row.live_longitude) : null;
    if (row.location_mode === 'custom' && custom) return custom;
    return live ?? custom;
}

export function fuzzedLocation(row: MemberLocationRow | null | undefined, userId: string, maxAgeMs = LIVE_MAX_AGE_MS): LatLng | null {
    const p = effectiveLocation(row, Date.now(), maxAgeMs);
    if (!p) return null;
    const f = fuzzCoords(p.latitude, p.longitude, userId);
    return { latitude: f.lat, longitude: f.lng };
}