import { Router } from 'express';
import { config } from '../config';

const router = Router();

const NAME_RE = /^places\/[A-Za-z0-9_-]{1,256}\/photos\/[A-Za-z0-9_-]{1,1024}$/;
const REF_RE = /^[A-Za-z0-9_-]{16,1024}$/;
const WIDTH_RE = /^\d{1,5}$/;
const ALLOWED_PARAMS = new Set(['name', 'ref', 'w']);
export const MAX_WIDTH = 1600;
const DEFAULT_WIDTH = 800;
export const RATE_LIMIT = 120;
const RATE_WINDOW_MS = 60_000;
const CACHE_MAX_ENTRIES = 300;
const CACHE_MAX_BYTES = 2 * 1024 * 1024;
const UPSTREAM_TIMEOUT_MS = 10_000;

const cache = new Map<string, { type: string; body: Buffer }>();
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

function parseQuery(query: Record<string, unknown>): { kind: 'name' | 'ref'; id: string; width: number } | null {
    if (Object.keys(query).some((k) => !ALLOWED_PARAMS.has(k))) return null;
    const { name, ref, w } = query;
    if (w !== undefined && (typeof w !== 'string' || !WIDTH_RE.test(w) || Number(w) < 1)) return null;
    const width = w === undefined ? DEFAULT_WIDTH : Math.min(Number(w), MAX_WIDTH);
    if (typeof name === 'string' && ref === undefined && NAME_RE.test(name)) return { kind: 'name', id: name, width };
    if (typeof ref === 'string' && name === undefined && REF_RE.test(ref)) return { kind: 'ref', id: ref, width };
    return null;
}

async function fetchFromGoogle(kind: 'name' | 'ref', id: string, width: number): Promise<Response> {
    const signal = AbortSignal.timeout(UPSTREAM_TIMEOUT_MS);
    const key = config.google.mapsApiKey;
    if (kind === 'ref') {
        return fetch(
            `https://maps.googleapis.com/maps/api/place/photo?maxwidth=${width}&photo_reference=${id}&key=${encodeURIComponent(key)}`,
            { signal, redirect: 'follow' },
        );
    }
    const meta = await fetch(
        `https://places.googleapis.com/v1/${id}/media?maxWidthPx=${width}&skipHttpRedirect=true`,
        { headers: { 'X-Goog-Api-Key': key }, signal },
    );
    if (!meta.ok) throw new Error(`photo metadata status ${meta.status}`);
    const { photoUri } = (await meta.json()) as { photoUri?: unknown };
    if (typeof photoUri !== 'string' || !photoUri.startsWith('https://')) throw new Error('photo metadata missing photoUri');
    return fetch(photoUri, { signal, redirect: 'follow' });
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
    const cacheKey = `${parsed.kind}:${parsed.id}:${parsed.width}`;
    let entry = cache.get(cacheKey);
    if (!entry) {
        try {
            const upstream = await fetchFromGoogle(parsed.kind, parsed.id, parsed.width);
            const type = upstream.headers.get('content-type') ?? '';
            if (!upstream.ok || !type.startsWith('image/')) throw new Error(`photo status ${upstream.status}`);
            entry = { type, body: Buffer.from(await upstream.arrayBuffer()) };
        } catch (e: any) {
            console.error('[photo] upstream failed:', String(e?.message ?? e).split(config.google.mapsApiKey).join('[redacted]'));
            res.status(502).json({ error: 'photo_unavailable' });
            return;
        }
        if (entry.body.length <= CACHE_MAX_BYTES) {
            if (cache.size >= CACHE_MAX_ENTRIES) cache.delete(cache.keys().next().value!);
            cache.set(cacheKey, entry);
        }
    }
    res.set({
        'Content-Type': entry.type,
        'Cache-Control': 'public, max-age=604800, immutable',
        'Cross-Origin-Resource-Policy': 'cross-origin',
    });
    res.send(entry.body);
});

export default router;
