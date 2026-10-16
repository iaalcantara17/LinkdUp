import { supabaseAdmin } from '../db';
import { HttpError, isGoogleQuotaError } from '../middleware/error';

export type CacheKind = 'nearby' | 'geocode' | 'photo';

const DAY_MS = 86_400_000;
const TTL_MS: Record<CacheKind, number> = { nearby: DAY_MS, geocode: 30 * DAY_MS, photo: DAY_MS };

type Row = { payload: unknown; fetched_at: string };

async function readRow(kind: CacheKind, key: string): Promise<Row | null> {
    try {
        const { data, error } = await supabaseAdmin
            .from('google_cache')
            .select('payload, fetched_at')
            .eq('kind', kind)
            .eq('key', key)
            .maybeSingle();
        if (error) throw error;
        return data as Row | null;
    } catch (e: any) {
        console.error('[google-cache] read failed:', e?.message ?? e);
        return null;
    }
}

async function writeRow(kind: CacheKind, key: string, payload: unknown): Promise<void> {
    try {
        const { error } = await supabaseAdmin
            .from('google_cache')
            .upsert({ kind, key, payload, fetched_at: new Date().toISOString() }, { onConflict: 'kind,key' });
        if (error) throw error;
    } catch (e: any) {
        console.error('[google-cache] write failed:', e?.message ?? e);
    }
}

export async function cached<T>(
    kind: CacheKind,
    key: string,
    fetcher: () => Promise<T>,
    force = false,
): Promise<{ value: T; hit: boolean; stale: boolean }> {
    const row = force ? null : await readRow(kind, key);
    if (row && Date.now() - Date.parse(row.fetched_at) < TTL_MS[kind]) return { value: row.payload as T, hit: true, stale: false };
    let value: T;
    try {
        value = await fetcher();
    } catch (e) {
        if (row && isQuotaError(e)) return { value: row.payload as T, hit: true, stale: true };
        throw e;
    }
    if (value != null) await writeRow(kind, key, value);
    return { value, hit: false, stale: false };
}

function isQuotaError(e: unknown): boolean {
    return isGoogleQuotaError(e) || (e instanceof HttpError && e.code === 'venue_limit_reached');
}

export function gridCell(center: { latitude: number; longitude: number }) {
    return { latitude: Number(center.latitude.toFixed(2)), longitude: Number(center.longitude.toFixed(2)) };
}

export function nearbyKey(center: { latitude: number; longitude: number }, radiusMeters: number, types: string[], page: number | 'base'): string {
    const cell = gridCell(center);
    return `${cell.latitude.toFixed(2)},${cell.longitude.toFixed(2)}|r${radiusMeters}|${types.join(',')}|p${page}`;
}

export function geocodeKey(query: string): string {
    return query.toLowerCase().replace(/\s*,\s*/g, ', ').replace(/\s+/g, ' ').trim();
}
