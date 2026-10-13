import './env';
import { test, mock, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import express from 'express';
import photoRoutes, { MAX_WIDTH, RATE_LIMIT } from '../src/routes/photo';

const KEY = process.env.GOOGLE_MAPS_API_KEY!;
const realFetch = globalThis.fetch;
const IMG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
let server: Server;
let base = '';
let seq = 0;
const newName = () => `places/ChIJplace${++seq}/photos/AeYphoto_${seq}-x`;
const newRef = () => `AUc7tXlegacyRef_${++seq}-abcdefgh`;

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

test('legacy photo reference returns image bytes', async () => {
    const calls = mockGoogle();
    const res = await get(`ref=${newRef()}&w=400`);
    const buf = Buffer.from(await res.arrayBuffer());
    assert.equal(res.status, 200);
    assert.deepEqual(buf, IMG);
    assert.ok(calls[0].url.startsWith('https://maps.googleapis.com/maps/api/place/photo?'));
    assert.match(calls[0].url, /maxwidth=400/);
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
    const qs = `ref=${newRef()}`;
    assert.equal((await get(qs)).status, 200);
    const second = await get(qs);
    assert.equal(second.status, 200);
    assert.deepEqual(Buffer.from(await second.arrayBuffer()), IMG);
    assert.equal(calls.length, 1);
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
    `ref=AUc7tXlegacyRef_valid-abcdefgh&name=${encodeURIComponent('places/a/photos/b')}`,
    'ref=AUc7tXlegacyRef_valid-abcdefgh&w=abc',
    'ref=AUc7tXlegacyRef_valid-abcdefgh&w=0',
    'ref=AUc7tXlegacyRef_valid-abcdefgh&w=-5',
    'ref=AUc7tXlegacyRef_valid-abcdefgh&url=https%3A%2F%2Fevil.example.com',
    'ref=AUc7tXlegacyRef_valid-abcdefgh&host=evil.example.com',
    'ref[]=AUc7tXlegacyRef_valid-abcdefgh',
    'ref=AUc7tXlegacyRef_valid-abcdefgh&ref=AUc7tXlegacyRef_other-abcdefgh',
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
    const res = await get(`ref=${newRef()}`);
    const body = await res.text();
    assert.equal(res.status, 502);
    assert.ok(!body.includes('html'));
});

test('upstream network failure returns 502', async () => {
    mockGoogle(() => {
        throw new TypeError(`fetch failed for key=${KEY}`);
    });
    const res = await get(`ref=${newRef()}`);
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

test('per-IP rate limit returns 429', async () => {
    mockGoogle();
    let last: Response | undefined;
    for (let i = 0; i <= RATE_LIMIT; i++) {
        last = await get('ref=short');
        await last.arrayBuffer();
    }
    assert.equal(last!.status, 429);
});
