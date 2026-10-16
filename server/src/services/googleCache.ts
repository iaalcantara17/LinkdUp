import { supabaseAdmin } from '../db';
import { HttpError } from '../middleware/error';

export type CacheKind = 'nearby' | 'geocode';

const HOUR_MS = 3_600_000;
const GEOCODE_TTL_MS = 24 * HOUR_MS;
const MAX_STALE_MS = 24 * HOUR_MS;
export const PRUNE_BATCH = 50;
export const WRITE_LIMIT_PER_MIN = 60;
const MAX_KEY_CHARS = 512;
let writeWindowStart = 0;
let writesInWindow: Record<CacheKind, number> = { nearby: 0, geocode: 0 };

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
        return;
    }
    await pruneExpired().catch((e: any) => console.error('[google-cache] prune failed:', e?.message ?? e));
}

async function pruneExpired(): Promise<void> {
    const cutoff = new Date(Date.now() - MAX_STALE_MS).toISOString();
    const { data, error } = await supabaseAdmin
        .from('google_cache')
        .select('fetched_at')
        .lt('fetched_at', cutoff)
        .order('fetched_at', { ascending: true })
        .limit(PRUNE_BATCH);
    if (error) throw error;
    const boundary = data?.at(-1)?.fetched_at;
    if (!boundary) return;
    const { error: deleteError } = await supabaseAdmin
        .from('google_cache')
        .delete()
        .lt('fetched_at', cutoff)
        .lte('fetched_at', boundary);
    if (deleteError) throw deleteError;
}

export async function cachedGeocode<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
    const row = await readRow('geocode', key);
    if (row && Date.now() - Date.parse(row.fetched_at) < GEOCODE_TTL_MS) return row.payload as T;
    const value = await fetcher();
    if (value != null) await storeRow('geocode', key, value);
    return value;
}

export async function storeRow(kind: CacheKind, key: string, payload: unknown): Promise<void> {
    if (writeAllowed(kind, key)) await writeRow(kind, key, payload);
}

export async function staleRow<T>(kind: CacheKind, key: string): Promise<T | null> {
    const row = await readRow(kind, key);
    return row && Date.now() - Date.parse(row.fetched_at) < MAX_STALE_MS ? (row.payload as T) : null;
}

function writeAllowed(kind: CacheKind, key: string): boolean {
    const now = Date.now();
    if (now - writeWindowStart >= 60_000) {
        writeWindowStart = now;
        writesInWindow = { nearby: 0, geocode: 0 };
    }
    if (writesInWindow[kind] >= WRITE_LIMIT_PER_MIN || key.length > MAX_KEY_CHARS) {
        console.error('[google-cache] write skipped: limit reached or entry too large');
        return false;
    }
    writesInWindow[kind] += 1;
    return true;
}

const inRange = (n: number, max: number) => Number.isFinite(n) && Math.abs(n) <= max;

export function gridCell(center: { latitude: number; longitude: number }) {
    if (!inRange(center.latitude, 90) || !inRange(center.longitude, 180)) throw new HttpError(400, 'invalid_coordinates');
    return { latitude: Number(center.latitude.toFixed(2)), longitude: Number(center.longitude.toFixed(2)) };
}

export function nearbyKey(center: { latitude: number; longitude: number }, radiusMeters: number, types: string[], page: number | 'base'): string {
    const cell = gridCell(center);
    const validRadius = Number.isInteger(radiusMeters / 1000) && radiusMeters >= 1000 && radiusMeters <= 50_000;
    const validTypes = types.length >= 1 && types.length <= 30 && types.every((t) => /^[a-z_]{1,40}$/.test(t));
    const validPage = page === 'base' || (Number.isInteger(page) && page >= 0 && page < 100);
    if (!validRadius || !validTypes || !validPage) throw new HttpError(400, 'invalid_cache_key');
    return `${cell.latitude.toFixed(2)},${cell.longitude.toFixed(2)}|r${radiusMeters}|${types.join(',')}|p${page}`;
}

export function normalizeQuery(query: string): string {
    return query.replace(/\s*,\s*/g, ', ').replace(/\s+/g, ' ').trim();
}

export function geocodeKey(query: string): string {
    const key = normalizeQuery(query).toLowerCase();
    if (key.length < 1 || key.length > 200) throw new HttpError(400, 'invalid_query');
    return key;
}
