import './env';
import { test, mock, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import express from 'express';
import photoRoutes, { CACHE_TOTAL_BYTES, MAX_WIDTH, PHOTO_FETCHES_PER_DAY, PHOTO_FETCHES_PER_MINUTE, RATE_LIMIT, WIDTHS } from '../src/routes/photo';

const KEY = process.env.GOOGLE_MAPS_API_KEY!;
const realFetch = globalThis.fetch;
const IMG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
let server: Server;
let base = '';
let seq = 0;
const newName = () => `places/ChIJplace${++seq}/photos/AeYphoto_${seq}-x`;

before(async () => {
    const app = express();
    app.use('/api/photo', photoRoutes);
    server = app.listen(0);
    await once(server, 'listening');
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => server.close());
afterEach(() => mock.restoreAll());

function mockGoogle(handler?: (url: string) => Response | Promise<Response>) {
    const calls: { url: string; init?: RequestInit }[] = [];
    mock.method(globalThis, 'fetch', async (input: any, init?: RequestInit) => {
        const url = String(input);
        calls.push({ url, init });
        if (handler) return handler(url);
        if (url.startsWith('https://places.googleapis.com/')) {
            return Response.json({ photoUri: 'https://lh3.googleusercontent.com/p/fake-photo' });
        }
        return new Response(IMG, { headers: { 'content-type': 'image/jpeg' } });
    });
    return calls;
}

const get = (qs: string) => realFetch(`${base}/api/photo?${qs}`);

function assertNoKey(res: Response, body: string) {
    assert.ok(!body.includes(KEY), 'body leaks key');
    for (const [h, v] of res.headers) assert.ok(!v.includes(KEY), `header ${h} leaks key`);
    assert.ok(!body.includes('googleapis.com'), 'body leaks google url');
}

test('new API photo name returns image bytes with cache headers', async () => {
    const calls = mockGoogle();
    const res = await get(`name=${encodeURIComponent(newName())}`);
    const buf = Buffer.from(await res.arrayBuffer());
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'image/jpeg');
    assert.match(res.headers.get('cache-control') ?? '', /public.*max-age=\d{5,}/);
    assert.equal(res.headers.get('cross-origin-resource-policy'), 'cross-origin');
    assert.deepEqual(buf, IMG);
    assert.ok(calls[0].url.startsWith('https://places.googleapis.com/v1/places/'));
    assertNoKey(res, buf.toString('latin1'));
});

test('width is clamped to the maximum', async () => {
    const calls = mockGoogle();
    const res = await get(`name=${encodeURIComponent(newName())}&w=99999`);
    assert.equal(res.status, 200);
    assert.match(calls[0].url, new RegExp(`maxWidthPx=${MAX_WIDTH}(&|$)`));
});

test('repeat views are served from memory', async () => {
    const calls = mockGoogle();
    const qs = `name=${encodeURIComponent(newName())}`;
    assert.equal((await get(qs)).status, 200);
    const afterFirst = calls.length;
    const second = await get(qs);
    assert.equal(second.status, 200);
    assert.deepEqual(Buffer.from(await second.arrayBuffer()), IMG);
    assert.equal(calls.length, afterFirst);
});

for (const qs of [
    '',
    'name=https%3A%2F%2Fevil.example.com%2Fx.jpg',
    'name=places%2Fabc%2Fphotos%2F..%2F..%2Fx',
    'name=places%2Fabc%2Fphotos%2Fxyz%3Fkey%3D1',
    'name=places%2Fabc%2Fphotos%2Fxyz%2Fmedia',
    'ref=has%20space_abcdefghijk',
    'ref=http%3A%2F%2Fevil.example.com',
    'ref=short',
    'ref=AUc7tXlegacyRef_valid-abcdefgh',
    `ref=AUc7tXlegacyRef_valid-abcdefgh&name=${encodeURIComponent('places/a/photos/b')}`,
    'photoreference=AUc7tXlegacyRef_valid-abcdefgh',
    'name=places%2FChIJvalid%2Fphotos%2FAeYvalid&w=abc',
    'name=places%2FChIJvalid%2Fphotos%2FAeYvalid&w=0',
    'name=places%2FChIJvalid%2Fphotos%2FAeYvalid&w=-5',
    'name=places%2FChIJvalid%2Fphotos%2FAeYvalid&url=https%3A%2F%2Fevil.example.com',
    'name=places%2FChIJvalid%2Fphotos%2FAeYvalid&host=evil.example.com',
    'name[]=places%2FChIJvalid%2Fphotos%2FAeYvalid',
    'name=places%2FChIJvalid%2Fphotos%2FAeYvalid&name=places%2FChIJother%2Fphotos%2FAeYother',
]) {
    test(`rejects ${JSON.stringify(qs)} with 400 and no Google call`, async () => {
        const calls = mockGoogle();
        const res = await get(qs);
        const body = await res.text();
        assert.equal(res.status, 400);
        assert.equal(calls.length, 0);
        assertNoKey(res, body);
    });
}

test('upstream error returns a clean 502 without the Google body', async () => {
    mockGoogle(() => new Response(`API key ${KEY} is invalid for https://places.googleapis.com`, { status: 403 }));
    const res = await get(`name=${encodeURIComponent(newName())}`);
    const body = await res.text();
    assert.equal(res.status, 502);
    assert.ok(!body.includes('invalid'));
    assertNoKey(res, body);
});

test('upstream non-image response returns 502', async () => {
    mockGoogle(() => new Response('<html>error</html>', { headers: { 'content-type': 'text/html' } }));
    const res = await get(`name=${encodeURIComponent(newName())}`);
    const body = await res.text();
    assert.equal(res.status, 502);
    assert.ok(!body.includes('html'));
});

test('upstream network failure returns 502', async () => {
    mockGoogle(() => {
        throw new TypeError(`fetch failed for key=${KEY}`);
    });
    const res = await get(`name=${encodeURIComponent(newName())}`);
    const body = await res.text();
    assert.equal(res.status, 502);
    assertNoKey(res, body);
});

test('the key is sent to Google only, never to the image host', async () => {
    const calls = mockGoogle();
    await get(`name=${encodeURIComponent(newName())}`);
    const imageCall = calls.find((c) => c.url.startsWith('https://lh3.googleusercontent.com/'))!;
    assert.ok(imageCall);
    assert.ok(!imageCall.url.includes(KEY));
    assert.ok(!JSON.stringify(imageCall.init ?? {}).includes(KEY));
});

test('memory cache evicts oldest photos once total bytes exceed the cap', async () => {
    const big = Buffer.alloc(1.5 * 1024 * 1024, 7);
    const calls = mockGoogle((url) =>
        url.startsWith('https://places.googleapis.com/')
            ? Response.json({ photoUri: `https://lh3.googleusercontent.com/p/${encodeURIComponent(url)}` })
            : new Response(big, { headers: { 'content-type': 'image/jpeg' } }),
    );
    const names = Array.from({ length: Math.ceil(CACHE_TOTAL_BYTES / big.length) + 1 }, newName);
    for (const n of names) await (await get(`name=${encodeURIComponent(n)}`)).arrayBuffer();
    const before = calls.length;
    await (await get(`name=${encodeURIComponent(names[0])}`)).arrayBuffer();
    assert.ok(calls.length > before);
    const lastBefore = calls.length;
    await (await get(`name=${encodeURIComponent(names.at(-1)!)}`)).arrayBuffer();
    assert.equal(calls.length, lastBefore);
});

test('concurrent fetches of the same photo do not inflate the memory byte count', async () => {
    const big = Buffer.alloc(1.5 * 1024 * 1024, 8);
    let release!: () => void;
    const bothInFlight = new Promise<void>((r) => (release = r));
    let metaCalls = 0;
    const calls = mockGoogle(async (url) => {
        if (!url.startsWith('https://places.googleapis.com/')) return new Response(big, { headers: { 'content-type': 'image/jpeg' } });
        if (++metaCalls === 2) release();
        if (metaCalls <= 2) await Promise.race([bothInFlight, new Promise((r) => setTimeout(r, 2000))]);
        return Response.json({ photoUri: `https://lh3.googleusercontent.com/p/${encodeURIComponent(url)}` });
    });
    const dup = `name=${encodeURIComponent(newName())}`;
    await Promise.all([get(dup), get(dup)].map(async (p) => (await p).arrayBuffer()));
    assert.equal(metaCalls, 2);
    for (let i = 1; i < CACHE_TOTAL_BYTES / big.length; i++) await (await get(`name=${encodeURIComponent(newName())}`)).arrayBuffer();
    const before = calls.length;
    await (await get(dup)).arrayBuffer();
    assert.equal(calls.length, before);
});

test('memory-cached photos expire after one hour', async () => {
    mock.timers.enable({ apis: ['Date'], now: Date.now() });
    const calls = mockGoogle();
    const qs = `name=${encodeURIComponent(newName())}`;
    await (await get(qs)).arrayBuffer();
    const first = calls.length;
    mock.timers.tick(59 * 60_000);
    await (await get(qs)).arrayBuffer();
    assert.equal(calls.length, first);
    mock.timers.tick(2 * 60_000);
    await (await get(qs)).arrayBuffer();
    assert.ok(calls.length > first);
});

test('widths snap to fixed sizes so changing w reuses the cache', async () => {
    const calls = mockGoogle();
    const name = encodeURIComponent(newName());
    assert.equal((await get(`name=${name}&w=401`)).status, 200);
    assert.match(calls[0].url, /maxWidthPx=800(&|$)/);
    const afterFirst = calls.length;
    for (const w of ['799', '450', '800']) assert.equal((await get(`name=${name}&w=${w}`)).status, 200);
    assert.equal((await get(`name=${name}`)).status, 200);
    assert.equal(calls.length, afterFirst);
    await (await get(`name=${name}&w=1`)).arrayBuffer();
    assert.match(calls.at(-2)!.url, /maxWidthPx=400(&|$)/);
    assert.deepEqual([...WIDTHS], [400, 800, 1200, 1600]);
});

const DAY = 24 * 60 * 60_000;
const metaCalls = (calls: { url: string }[]) => calls.filter((c) => c.url.startsWith('https://places.googleapis.com/')).length;

test('uncached fetches stop at the per-minute ceiling with a short-cached 429, and cached photos still load', async () => {
    mock.timers.reset();
    mock.timers.enable({ apis: ['Date'], now: Date.now() + 5 * DAY });
    try {
        const calls = mockGoogle();
        const cached = `name=${encodeURIComponent(newName())}`;
        assert.equal((await get(cached)).status, 200);
        for (let i = 1; i < PHOTO_FETCHES_PER_MINUTE; i++) assert.equal((await get(`name=${encodeURIComponent(newName())}`)).status, 200);
        const before = calls.length;
        const limited = await get(`name=${encodeURIComponent(newName())}`);
        assert.equal(limited.status, 429);
        assert.equal((await limited.json()).error, 'photo_limit_reached');
        assert.match(limited.headers.get('cache-control') ?? '', /max-age=(\d{1,3})(,|$)/);
        assert.ok(Number(/max-age=(\d+)/.exec(limited.headers.get('cache-control')!)![1]) <= 300);
        assert.equal(calls.length, before);
        const hit = await get(cached);
        assert.equal(hit.status, 200);
        assert.deepEqual(Buffer.from(await hit.arrayBuffer()), IMG);
        mock.timers.tick(61_000);
        assert.equal((await get(`name=${encodeURIComponent(newName())}`)).status, 200);
    } finally {
        mock.timers.reset();
    }
});

test('uncached fetches stop at the per-day ceiling below the Google cap until the day window resets', async () => {
    mock.timers.reset();
    mock.timers.enable({ apis: ['Date'], now: Date.now() + 10 * DAY });
    try {
        const calls = mockGoogle();
        assert.ok(PHOTO_FETCHES_PER_DAY < 1000);
        for (let i = 0; i < PHOTO_FETCHES_PER_DAY; i++) {
            if (i > 0 && i % PHOTO_FETCHES_PER_MINUTE === 0) mock.timers.tick(61_000);
            const res = await get(`name=${encodeURIComponent(newName())}`);
            await res.arrayBuffer();
            assert.equal(res.status, 200, `fetch ${i + 1}`);
        }
        mock.timers.tick(61_000);
        const limited = await get(`name=${encodeURIComponent(newName())}`);
        assert.equal(limited.status, 429);
        assert.equal((await limited.json()).error, 'photo_limit_reached');
        assert.equal(metaCalls(calls), PHOTO_FETCHES_PER_DAY);
        mock.timers.tick(DAY);
        assert.equal((await get(`name=${encodeURIComponent(newName())}`)).status, 200);
    } finally {
        mock.timers.reset();
    }
});

test('per-IP rate limit returns 429', async () => {
    mockGoogle();
    let last: Response | undefined;
    for (let i = 0; i <= RATE_LIMIT; i++) {
        last = await get('name=bad');
        await last.arrayBuffer();
    }
    assert.equal(last!.status, 429);
});
