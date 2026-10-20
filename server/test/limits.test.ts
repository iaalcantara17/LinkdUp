import './env';
import { test, mock, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import express from 'express';
import { rateLimit } from '../src/middleware/rateLimit';
import authRoutes, { AUTH_LIMIT, LOGIN_LIMIT } from '../src/routes/auth';
import partyRoutes, { JOIN_LIMIT } from '../src/routes/party';
import schoolsRoutes, { LOOKUP_LIMIT } from '../src/routes/schools';
import userRoutes, { USERNAME_CHECK_LIMIT } from '../src/routes/user';
import feedRoutes from '../src/routes/feed';
import discoverRoutes, { DISCOVER_SEARCH_LIMIT, DISCOVER_VENUES_LIMIT } from '../src/routes/discover';
import { TEXT_SEARCH_CALLS_PER_DAY } from '../src/services/places';
import axios from 'axios';
import { supabaseAdmin } from '../src/db';
import { mockSupabase, serve, auth, realFetch } from './supabaseMock';

const USERS = { 'tok-a': 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'tok-b': 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' };

afterEach(() => mock.restoreAll());

test('rateLimit counts per key and resets after the window', () => {
    mock.timers.enable({ apis: ['Date'], now: 0 });
    try {
        const limiter = rateLimit(2, 1000);
        const run = (ip: string) => {
            let status = 200;
            const res: any = { set: () => res, status: (s: number) => { status = s; return res; }, json: () => res };
            limiter({ ip } as any, res, () => {});
            return status;
        };
        assert.deepEqual([run('1.1.1.1'), run('1.1.1.1'), run('1.1.1.1')], [200, 200, 429]);
        assert.equal(run('2.2.2.2'), 200);
        mock.timers.tick(1001);
        assert.equal(run('1.1.1.1'), 200);
    } finally {
        mock.timers.reset();
    }
});

async function hammer(base: string, method: string, path: string, times: number, body?: unknown, headers: Record<string, string> = {}) {
    let last: Response | undefined;
    for (let i = 0; i < times; i++) {
        last = await realFetch(`${base}${path}`, {
            method,
            headers: { 'content-type': 'application/json', ...headers },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        await last.arrayBuffer();
        if (last.status === 429 && i < times - 1) assert.fail(`429 too early on attempt ${i + 1}`);
    }
    return last!;
}

const limited: [string, () => Promise<{ server: Server; base: string }>, string, string, () => number, unknown?, Record<string, string>?][] = [
    ['login', () => serve('/api/auth', authRoutes), 'POST', '/api/auth/login', () => LOGIN_LIMIT, {}],
    ['signup', () => serve('/api/auth', authRoutes), 'POST', '/api/auth/signup', () => LOGIN_LIMIT, {}],
    ['auth me', () => serve('/api/auth', authRoutes), 'GET', '/api/auth/me', () => AUTH_LIMIT],
    ['party join', () => serve('/api/party', partyRoutes), 'POST', '/api/party/join', () => JOIN_LIMIT, {}, auth('tok-a')],
    ['school lookup', () => serve('/api/schools', schoolsRoutes), 'POST', '/api/schools/lookup', () => LOOKUP_LIMIT, {}],
    ['username check', () => serve('/api/user', userRoutes), 'GET', '/api/user/username-available?u=x', () => USERNAME_CHECK_LIMIT, undefined, auth('tok-a')],
];

for (const [name, mount, method, path, limit, body, headers] of limited) {
    test(`${name} is rate limited per IP`, async () => {
        mock.method(console, 'error', () => {});
        mockSupabase(USERS);
        const { server, base } = await mount();
        try {
            const res = await hammer(base, method, path, limit() + 1, body, headers);
            assert.equal(res.status, 429);
            assert.deepEqual(await realFetch(`${base}${path}`, { method, headers: { 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : '{}' }).then((r) => r.json()), { error: 'rate_limited' });
        } finally {
            server.close();
        }
    });
}

let feed: { server: Server; base: string };
before(async () => (feed = await serve('/api/discover', feedRoutes)));
after(() => feed.server.close());

function uploadUrl(ext: unknown) {
    return realFetch(`${feed.base}/api/discover/feed/upload-url`, {
        method: 'POST',
        headers: { ...auth('tok-a'), 'content-type': 'application/json' },
        body: JSON.stringify({ ext }),
    });
}

for (const ext of ['html', 'svg', 'js', 'php', 'jpg/../../x', '', 'png.html', 42]) {
    test(`upload-url rejects extension ${JSON.stringify(ext)}`, async () => {
        mockSupabase(USERS);
        const signed = mock.method(supabaseAdmin.storage, 'from', () => ({ createSignedUploadUrl: async () => ({ data: { signedUrl: 'u' }, error: null }) }));
        const res = await uploadUrl(ext);
        assert.equal(res.status, 400);
        assert.equal(signed.mock.callCount(), 0);
    });
}

for (const ext of ['jpg', 'JPEG', 'png', 'webp', 'heic', 'gif']) {
    test(`upload-url accepts image extension ${ext}`, async () => {
        mockSupabase(USERS);
        let path = '';
        mock.method(supabaseAdmin.storage, 'from', () => ({
            createSignedUploadUrl: async (p: string) => { path = p; return { data: { signedUrl: 'u' }, error: null }; },
        }));
        const res = await uploadUrl(ext);
        assert.equal(res.status, 200);
        assert.match(path, new RegExp(`^${USERS['tok-a']}/\\d+\\.${ext.toLowerCase()}$`));
    });
}

const DAY = 24 * 60 * 60_000;
const discoverLimited: [string, string, () => number][] = [
    ['venues', '/api/discover/venues', () => DISCOVER_VENUES_LIMIT],
    ['venues/more', '/api/discover/venues/more', () => DISCOVER_VENUES_LIMIT],
    ['places/search', '/api/discover/places/search', () => DISCOVER_SEARCH_LIMIT],
];

for (const [name, path, limit] of discoverLimited) {
    test(`discover ${name} is rate limited per user, not per IP`, async () => {
        mock.timers.reset();
        mock.timers.enable({ apis: ['Date'], now: Date.now() + 3 * DAY });
        mockSupabase(USERS);
        const post = mock.method(axios, 'post', async () => ({ data: { places: [] } }));
        const { server, base } = await serve('/api/discover', discoverRoutes);
        try {
            const res = await hammer(base, 'GET', path, limit() + 1, undefined, auth('tok-a'));
            assert.equal(res.status, 429);
            const other = await realFetch(`${base}${path}`, { headers: auth('tok-b') });
            assert.notEqual(other.status, 429);
            assert.equal(post.mock.callCount(), 0);
        } finally {
            server.close();
            mock.timers.reset();
        }
    });
}

test('place text search stops at a daily ceiling with venue_limit_reached', async () => {
    mock.timers.reset();
    mock.timers.enable({ apis: ['Date'], now: Date.now() + 20 * DAY });
    mock.method(console, 'error', () => {});
    mockSupabase(USERS);
    const post = mock.method(axios, 'post', async () => ({ data: { places: [] } }));
    const { server, base } = await serve('/api/discover', discoverRoutes);
    try {
        assert.ok(TEXT_SEARCH_CALLS_PER_DAY > 0);
        for (let i = 0; i < TEXT_SEARCH_CALLS_PER_DAY; i++) {
            if (i > 0 && i % DISCOVER_SEARCH_LIMIT === 0) mock.timers.tick(61_000);
            const res = await realFetch(`${base}/api/discover/places/search?q=cafe${i}`, { headers: auth('tok-a') });
            assert.equal(res.status, 200, `search ${i + 1}`);
            await res.arrayBuffer();
        }
        mock.timers.tick(61_000);
        const limited = await realFetch(`${base}/api/discover/places/search?q=one+more`, { headers: auth('tok-a') });
        assert.equal(limited.status, 503);
        assert.deepEqual(await limited.json(), { error: 'venue_limit_reached' });
        assert.equal(post.mock.callCount(), TEXT_SEARCH_CALLS_PER_DAY);
        mock.timers.tick(DAY);
        assert.equal((await realFetch(`${base}/api/discover/places/search?q=next+day`, { headers: auth('tok-a') })).status, 200);
    } finally {
        server.close();
        mock.timers.reset();
    }
});
