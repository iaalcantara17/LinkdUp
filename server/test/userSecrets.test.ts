import './env';
import { test, before, after, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import userRoutes from '../src/routes/user';
import authRoutes from '../src/routes/auth';
import { mockSupabase, serve, auth, realFetch } from './supabaseMock';

const ME = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const USERS = { 'tok-a': ME };

const fullRow = (id: string) => ({
    id,
    email: `${id}@test.dev`,
    display_name: 'Ada',
    username: 'ada',
    school_id: null,
    graduation_year: 2026,
    avatar_color: '#123456',
    avatar_url: null,
    latitude: 40.7,
    longitude: -74,
    last_location_at: null,
    pronouns: null,
    birthday: '2000-01-01',
    bio: null,
    theme_preference: 'dark',
    has_seen_walkthrough: true,
    location_permission_status: 'granted',
    last_seen_at: null,
    is_online: false,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    google_calendar_token: 'SECRET_ACCESS_TOKEN',
    google_calendar_refresh: 'SECRET_REFRESH_TOKEN',
});

const SELF_KEYS = [
    'id', 'email', 'display_name', 'username', 'school_id', 'graduation_year', 'avatar_color', 'avatar_url',
    'latitude', 'longitude', 'last_location_at', 'pronouns', 'birthday', 'bio', 'theme_preference',
    'has_seen_walkthrough', 'location_permission_status', 'age',
].sort();

const PUBLIC_KEYS = [
    'id', 'display_name', 'username', 'avatar_url', 'avatar_color', 'school', 'graduation_year', 'pronouns',
    'age', 'bio', 'follower_count', 'following_count', 'is_blocked_by_me',
].sort();

let userSrv: Server, authSrv: Server;
let userBase = '', authBase = '';
before(async () => {
    ({ server: userSrv, base: userBase } = await serve('/api/user', userRoutes));
    ({ server: authSrv, base: authBase } = await serve('/api/auth', authRoutes));
});
after(() => { userSrv.close(); authSrv.close(); });
afterEach(() => mock.restoreAll());

function dbWithSecrets() {
    return mockSupabase(USERS, (call) => {
        if (call.table !== 'users') return [];
        const id = call.url.searchParams.get('id')?.replace('eq.', '') ?? ME;
        const row: Record<string, unknown> = fullRow(id);
        const select = call.url.searchParams.get('select') ?? '*';
        if (select === '*') return [row];
        return [Object.fromEntries(select.split(',').map((c) => c.trim()).map((c) => [c, row[c]]))];
    });
}

async function call(base: string, method: string, path: string, body?: unknown) {
    const res = await realFetch(`${base}${path}`, {
        method,
        headers: { 'content-type': 'application/json', ...auth('tok-a') },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, text: await res.text() };
}

function assertNoSecrets(text: string) {
    assert.doesNotMatch(text, /SECRET_/);
    assert.doesNotMatch(text, /google_calendar_(token|refresh)/);
}

const selfEndpoints: [string, () => Promise<{ status: number; text: string }>][] = [
    ['GET /api/user/me', () => call(userBase, 'GET', '/api/user/me')],
    ['PATCH /api/user/me', () => call(userBase, 'PATCH', '/api/user/me', { bio: 'hi' })],
    ['GET /api/auth/me', () => call(authBase, 'GET', '/api/auth/me')],
    ['POST /api/auth/ensure-profile', () => call(authBase, 'POST', '/api/auth/ensure-profile', { email: 'a@test.dev', display_name: 'Ada' })],
];

for (const [name, run] of selfEndpoints) {
    test(`${name} returns only allowlisted profile fields`, async () => {
        dbWithSecrets();
        const { status, text } = await run();
        assert.equal(status, 200, text);
        assertNoSecrets(text);
        const keys = Object.keys(JSON.parse(text)).filter((k) => k !== 'google_calendar_connected').sort();
        assert.deepEqual(keys, SELF_KEYS);
    });
}

test('GET /api/auth/me still reports calendar connection as a boolean', async () => {
    dbWithSecrets();
    const { text } = await call(authBase, 'GET', '/api/auth/me');
    assert.equal(JSON.parse(text).google_calendar_connected, true);
});

test('GET /api/user/:id/public returns only public profile fields', async () => {
    dbWithSecrets();
    const { status, text } = await call(userBase, 'GET', `/api/user/${OTHER}/public`);
    assert.equal(status, 200, text);
    assertNoSecrets(text);
    assert.deepEqual(Object.keys(JSON.parse(text)).sort(), PUBLIC_KEYS);
});

test('no code selects users rows with a wildcard, and only server-side code reads token columns', () => {
    const src = join(__dirname, '..', 'src');
    const files = readdirSync(src, { recursive: true }).map(String).filter((f) => f.endsWith('.ts'));
    const tokenReaders: string[] = [];
    for (const file of files) {
        const text = readFileSync(join(src, file), 'utf8');
        for (const m of text.matchAll(/from\('users'\)/g)) {
            const rest = text.slice(m.index + m[0].length);
            const ends = [rest.indexOf(';'), rest.indexOf('.from(')].filter((i) => i >= 0);
            const chain = rest.slice(0, Math.min(...ends, rest.length));
            const sel = chain.match(/\.select\(([^)]*)\)/);
            if (!sel) continue;
            assert.notEqual(sel[1].trim(), '', `${file}: users .select() with no column list`);
            assert.doesNotMatch(sel[1], /\*/, `${file}: users select('*')`);
        }
        if (/select\([^)]*google_calendar_(token|refresh)/.test(text)) tokenReaders.push(file.replace(/\\/g, '/'));
    }
    assert.deepEqual(tokenReaders.sort(), ['routes/auth.ts', 'routes/dates.ts', 'services/googleCalendar.ts']);
});
