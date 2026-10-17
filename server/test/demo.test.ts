import './env';
import { test, before, after, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type express from 'express';
import { bootApp, client, freshWorld, mockGoogle, tok } from './flowApp';
import type { FakeSupabase } from './fakeSupabase';
import { requireAuth } from '../src/middleware/auth';
import { BLOCKED_READS } from '../src/middleware/demo';
import { supabaseAdmin } from '../src/db';

const DEMO = 'de300000-0000-4000-8000-0000000000d1';
const PARTY = 'de300000-0000-4000-8000-0000000000a1';
const OTHER_PARTY = 'de300000-0000-4000-8000-0000000000a2';
const DEMO_EMAIL = 'demo@linkdup.app';
const DEMO_PASSWORD = randomUUID();

let server: Server;
let base = '';
let app: express.Express;
let fake: FakeSupabase;
let google: ReturnType<typeof mockGoogle>;
let call: ReturnType<typeof client>['call'];
let logged: string[];

before(async () => ({ server, base, app } = await bootApp()));
after(() => server.close());
beforeEach(() => {
    logged = [];
    const capture = (...args: unknown[]) => { logged.push(args.map(String).join(' ')); };
    mock.method(console, 'error', capture);
    mock.method(console, 'log', capture);
    mock.method(console, 'warn', capture);
    process.env.DEMO_USER_ID = DEMO;
    process.env.DEMO_USER_EMAIL = DEMO_EMAIL;
    process.env.DEMO_USER_PASSWORD = DEMO_PASSWORD;
    fake = freshWorld();
    fake.addUser(DEMO, { email: DEMO_EMAIL });
    fake.setPassword(DEMO, DEMO_PASSWORD);
    google = mockGoogle();
    call = client(base).call;
});
afterEach(() => {
    mock.restoreAll();
    delete process.env.ENABLE_GEMINI_PITCHES;
    delete process.env.GEMINI_API_KEY;
    delete process.env.DEMO_USER_ID;
    delete process.env.DEMO_USER_EMAIL;
    delete process.env.DEMO_USER_PASSWORD;
});

type Route = { method: string; path: string; authed: boolean };

function routes(): Route[] {
    const out: Route[] = [];
    const add = (route: any, mount: string) => {
        for (const method of Object.keys(route.methods)) {
            out.push({
                method: method.toUpperCase(),
                path: `${mount}${route.path === '/' && mount ? '' : route.path}`,
                authed: route.stack.some((s: any) => s.handle === requireAuth),
            });
        }
    };
    for (const layer of (app as any)._router.stack) {
        if (layer.route) add(layer.route, '');
        else if (layer.name === 'router') {
            const mount = layer.regexp.source.replace(/^\^/, '').replace('\\/?(?=\\/|$)', '').replace(/\\\//g, '/');
            for (const inner of layer.handle.stack) if (inner.route) add(inner.route, mount);
        }
    }
    return out;
}

const writes = () => routes().filter((r) => r.method !== 'GET' && r.method !== 'HEAD');
const concrete = (path: string) => path.replace(/:\w+/g, PARTY);
const label = (r: Route) => `${r.method} ${r.path}`;
const refused = (res: { status: number; json: any }) => res.status === 403 && res.json?.error === 'demo_read_only';

function seedDemoParties() {
    fake.db.parties.push(
        { id: PARTY, code: 'DEMOA1', name: 'Demo: Brunch', host_user_id: 'alice', status: 'swiping', midpoint_lat: 40.74, midpoint_lng: -74.03, venue_rotation_seed: 0, current_card_index: 0, voting_round: 1, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
        { id: OTHER_PARTY, code: 'DEMOB2', name: 'Demo: Trivia', host_user_id: DEMO, status: 'waiting', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
    );
    for (const [party_id, user_id] of [[PARTY, DEMO], [PARTY, 'alice'], [OTHER_PARTY, DEMO]]) {
        fake.db.party_members.push({ party_id, user_id, joined_at: '2026-01-01T00:00:00Z', location_mode: 'custom', custom_latitude: 40.74, custom_longitude: -74.03, custom_label: 'Hoboken, NJ' });
    }
    const loc = (id: string, party_id: string, place: string, name: string) => ({
        id, party_id, google_place_id: place, name, address: '1 Demo St, Hoboken, NJ', latitude: 40.744, longitude: -74.031,
        photo_url: '/demo/venue-1.jpg', rating: 4.5, user_ratings_total: 120, category: 'Cafe', price_level: 2, is_priority: false, created_at: '2026-01-01T00:00:00Z',
    });
    fake.db.locations.push(
        loc('de300000-0000-4000-8000-0000000000b1', PARTY, 'demo-cafe', 'Demo Cafe'),
        { ...loc('de300000-0000-4000-8000-0000000000b2', PARTY, 'demo-bowl', 'Demo Bowl'), rating: 4.8 },
        loc('de300000-0000-4000-8000-0000000000b3', OTHER_PARTY, 'demo-cafe', 'Demo Cafe'),
    );
}

test('the route list is generated from the router', () => {
    const all = writes();
    assert.ok(all.length > 50, `only ${all.length} mutating routes found`);
    assert.ok(all.some((r) => label(r) === 'POST /api/party/:id/vote'));
    assert.ok(all.some((r) => label(r) === 'DELETE /api/user/me'));
});

test('the only mutating routes without sign in are signup, login, demo and school lookup', () => {
    assert.deepEqual(
        writes().filter((r) => !r.authed).map(label).sort(),
        ['POST /api/auth/demo', 'POST /api/auth/login', 'POST /api/auth/signup', 'POST /api/schools/lookup'],
    );
});

test('the demo user is refused on every signed-in mutating route except logout, and nothing is written', async () => {
    const notRefused: string[] = [];
    for (const r of writes().filter((w) => w.authed)) {
        const res = await call(r.method, concrete(r.path), tok(DEMO), {});
        const isLogout = label(r) === 'POST /api/auth/logout';
        if (refused(res) === isLogout) notRefused.push(`${label(r)} -> ${res.status} ${res.text}`);
    }
    assert.deepEqual(notRefused, []);
    assert.deepEqual(fake.calls.filter((c) => c.method !== 'GET' && c.method !== 'HEAD').map((c) => `${c.method} ${c.table}`), []);
    assert.equal(google.places.mock.callCount(), 0);
    assert.equal(google.calendar.mock.callCount(), 0);
});

test('a normal user is never refused as demo on any mutating route', async () => {
    const hit: string[] = [];
    for (const r of writes()) {
        const res = await call(r.method, concrete(r.path), tok('alice'), {});
        if (refused(res)) hit.push(label(r));
    }
    assert.deepEqual(hit, []);
});

test('demo user can read their profile, parties, members and venues', async () => {
    seedDemoParties();
    const me = await call('GET', '/api/auth/me', tok(DEMO));
    assert.equal(me.status, 200, me.text);
    assert.equal(me.json.is_demo, true);
    for (const path of ['/api/user/me/parties', `/api/party/${PARTY}`, `/api/party/${PARTY}/members`, `/api/party/${PARTY}/locations`, `/api/party/${PARTY}/my-votes`, '/api/user/me/hangouts']) {
        const res = await call('GET', path, tok(DEMO));
        assert.equal(res.status, 200, `${path} ${res.text}`);
    }
    assert.equal(fake.db.users.find((u) => u.id === DEMO)?.last_seen_at, undefined);
});

test('a normal user is not marked as demo', async () => {
    const me = await call('GET', '/api/auth/me', tok('alice'));
    assert.equal(me.status, 200, me.text);
    assert.equal(me.json.is_demo, false);
});

test('Discover gives the demo user stored venues without calling Google', async () => {
    seedDemoParties();
    const res = await call('GET', '/api/discover/venues?lat=40.74&lng=-74.03', tok(DEMO));
    assert.equal(res.status, 200, res.text);
    assert.deepEqual(res.json.map((v: any) => v.name), ['Demo Bowl', 'Demo Cafe']);
    assert.equal(res.json[0].photo_url, '/demo/venue-1.jpg');
    assert.equal(typeof res.json[0].distance_miles, 'number');
    const more = await call('GET', '/api/discover/venues/more?lat=40.74&lng=-74.03', tok(DEMO));
    assert.equal(more.status, 200, more.text);
    assert.deepEqual(more.json, { venues: [], hasMore: false, exhausted: true, newToken: false });
    const deck = await call('GET', `/api/party/${PARTY}/more-venues`, tok(DEMO));
    assert.equal(deck.status, 200, deck.text);
    assert.deepEqual(deck.json, { new_venue_count: 0, exhausted: true });
    assert.equal(google.places.mock.callCount(), 0);
    assert.equal(fake.calls.filter((c) => c.method !== 'GET' && c.method !== 'HEAD').length, 0);
});

test('a normal user still gets live Discover venues', async () => {
    const res = await call('GET', '/api/discover/venues?lat=40.74&lng=-74.03', tok('alice'));
    assert.equal(res.status, 200, res.text);
    assert.ok(google.places.mock.callCount() > 0);
});

test('the demo user is refused on GETs that spend Google quota', async () => {
    for (const path of ['/api/calendar/oauth/start', '/api/discover/places/search?q=cafe', '/api/user/location/search?q=Hoboken', '/API/Discover/Places/Search/?q=cafe']) {
        const res = await call('GET', path, tok(DEMO));
        assert.ok(refused(res), `${path} -> ${res.status} ${res.text}`);
    }
    assert.equal(google.places.mock.callCount(), 0);
});

test('every blocked quota GET is a real GET route', () => {
    const gets = new Set(routes().filter((r) => r.method === 'GET').map((r) => r.path.toLowerCase()));
    for (const path of BLOCKED_READS) assert.ok(gets.has(path), `${path} is not a GET route`);
});

test('venue pitches for the demo user never call Gemini', async () => {
    seedDemoParties();
    process.env.ENABLE_GEMINI_PITCHES = 'true';
    process.env.GEMINI_API_KEY = 'test-gemini-key';
    const gemini = () => google.places.mock.calls.filter((c) => String(c.arguments[0]).includes('generativelanguage')).length;
    const venue = await call('GET', `/api/party/${PARTY}/pitch?venue_id=de300000-0000-4000-8000-0000000000b1`, tok(DEMO));
    const discover = await call('GET', '/api/discover/pitch?name=Somewhere%20New', tok(DEMO));
    assert.equal(venue.status, 200, venue.text);
    assert.equal(discover.status, 200, discover.text);
    assert.equal(typeof venue.json.pitch, 'string');
    assert.equal(typeof discover.json.pitch, 'string');
    assert.equal(gemini(), 0);
    await call('GET', '/api/discover/pitch?name=Another%20Place', tok('alice'));
    assert.equal(gemini(), 1);
});

test('demo logout does not sign out the other demo visitors', async () => {
    const signOut = mock.method(supabaseAdmin.auth.admin, 'signOut', async () => ({ data: null, error: null }));
    const demo = await call('POST', '/api/auth/logout', tok(DEMO));
    assert.equal(demo.status, 200, demo.text);
    assert.equal(signOut.mock.callCount(), 0);
    await call('POST', '/api/auth/logout', tok('alice'));
    assert.equal(signOut.mock.callCount(), 1);
});

test('demo mode is off when DEMO_USER_ID is unset or not a UUID', async () => {
    for (const value of [undefined, 'not-a-uuid']) {
        if (value === undefined) delete process.env.DEMO_USER_ID;
        else process.env.DEMO_USER_ID = value;
        const res = await call('POST', '/api/party', tok(DEMO), { name: 'Mine' });
        assert.equal(res.status, 201, res.text);
        const me = await call('GET', '/api/auth/me', tok(DEMO));
        assert.equal(me.json.is_demo, false);
    }
});
