import { Router } from 'express';
import { config } from '../config';
import { cached } from '../services/googleCache';

const router = Router();

const NAME_RE = /^places\/[A-Za-z0-9_-]{1,256}\/photos\/[A-Za-z0-9_-]{1,1024}$/;
const WIDTH_RE = /^\d{1,5}$/;
const ALLOWED_PARAMS = new Set(['name', 'w']);
export const MAX_WIDTH = 1600;
const DEFAULT_WIDTH = 800;
export const RATE_LIMIT = 120;
const RATE_WINDOW_MS = 60_000;
const CACHE_MAX_ENTRIES = 300;
const CACHE_MAX_BYTES = 2 * 1024 * 1024;
export const CACHE_TOTAL_BYTES = 24 * 1024 * 1024;
const UPSTREAM_TIMEOUT_MS = 10_000;

const cache = new Map<string, { type: string; body: Buffer }>();
let cachedBytes = 0;
const hits = new Map<string, { count: number; resetAt: number }>();

function rateLimited(ip: string): boolean {
    const now = Date.now();
    const hit = hits.get(ip);
    if (!hit || hit.resetAt <= now) {
        if (hits.size >= 10_000) hits.clear();
        hits.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
        return false;
    }
    hit.count += 1;
    return hit.count > RATE_LIMIT;
}

function parseQuery(query: Record<string, unknown>): { name: string; width: number } | null {
    if (Object.keys(query).some((k) => !ALLOWED_PARAMS.has(k))) return null;
    const { name, w } = query;
    if (w !== undefined && (typeof w !== 'string' || !WIDTH_RE.test(w) || Number(w) < 1)) return null;
    if (typeof name !== 'string' || !NAME_RE.test(name)) return null;
    return { name, width: w === undefined ? DEFAULT_WIDTH : Math.min(Number(w), MAX_WIDTH) };
}

async function fetchPhotoUri(name: string, width: number, signal: AbortSignal): Promise<{ uri: string }> {
    const meta = await fetch(
        `https://places.googleapis.com/v1/${name}/media?maxWidthPx=${width}&skipHttpRedirect=true`,
        { headers: { 'X-Goog-Api-Key': config.google.mapsApiKey }, signal },
    );
    if (!meta.ok) throw new Error(`photo metadata status ${meta.status}`);
    const { photoUri } = (await meta.json()) as { photoUri?: unknown };
    if (typeof photoUri !== 'string' || !photoUri.startsWith('https://')) throw new Error('photo metadata missing photoUri');
    return { uri: photoUri };
}

async function fetchImage(uri: unknown, signal: AbortSignal): Promise<{ type: string; body: Buffer }> {
    if (typeof uri !== 'string' || !uri.startsWith('https://')) throw new Error('invalid photo uri');
    const upstream = await fetch(uri, { signal, redirect: 'follow' });
    const type = upstream.headers.get('content-type') ?? '';
    if (!upstream.ok || !type.startsWith('image/')) throw new Error(`photo status ${upstream.status}`);
    return { type, body: Buffer.from(await upstream.arrayBuffer()) };
}

async function fetchFromGoogle(name: string, width: number): Promise<{ type: string; body: Buffer }> {
    const signal = AbortSignal.timeout(UPSTREAM_TIMEOUT_MS);
    const key = `${name}:${width}`;
    const getUri = () => fetchPhotoUri(name, width, signal);
    const first = await cached('photo', key, getUri);
    try {
        return await fetchImage(first.value.uri, signal);
    } catch (e) {
        if (!first.hit) throw e;
        return fetchImage((await cached('photo', key, getUri, true)).value.uri, signal);
    }
}

function remember(key: string, entry: { type: string; body: Buffer }) {
    if (entry.body.length > CACHE_MAX_BYTES) return;
    while (cache.size && (cache.size >= CACHE_MAX_ENTRIES || cachedBytes + entry.body.length > CACHE_TOTAL_BYTES)) {
        const [oldestKey, oldest] = cache.entries().next().value!;
        cachedBytes -= oldest.body.length;
        cache.delete(oldestKey);
    }
    cache.set(key, entry);
    cachedBytes += entry.body.length;
}

router.get('/', async (req, res) => {
    if (rateLimited(req.ip ?? 'unknown')) {
        res.status(429).json({ error: 'rate_limited' });
        return;
    }
    const parsed = parseQuery(req.query as Record<string, unknown>);
    if (!parsed) {
        res.status(400).json({ error: 'invalid_photo_id' });
        return;
    }
    const cacheKey = `${parsed.name}:${parsed.width}`;
    let entry = cache.get(cacheKey);
    if (!entry) {
        try {
            entry = await fetchFromGoogle(parsed.name, parsed.width);
        } catch (e: any) {
            console.error('[photo] upstream failed:', String(e?.message ?? e).split(config.google.mapsApiKey).join('[redacted]'));
            res.status(502).json({ error: 'photo_unavailable' });
            return;
        }
        remember(cacheKey, entry);
    }
    res.set({
        'Content-Type': entry.type,
        'Cache-Control': 'public, max-age=604800, immutable',
        'Cross-Origin-Resource-Policy': 'cross-origin',
    });
    res.send(entry.body);
});

export default router;
