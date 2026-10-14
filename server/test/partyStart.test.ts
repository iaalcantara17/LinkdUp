import './env';
import { test, mock, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import axios from 'axios';
import partyRoutes from '../src/routes/party';
import { mockSupabase, serve, auth, realFetch } from './supabaseMock';

const USERS = { 'tok-alice': 'alice-id' };
const HOBOKEN = { custom_latitude: 40.744, custom_longitude: -74.032, custom_label: 'Hoboken', location_mode: 'custom' };
const NEWARK_LIVE = () => ({ live_latitude: 40.736, live_longitude: -74.172, live_at: new Date().toISOString(), location_mode: 'live' });
const NOTHING = { location_mode: 'live', live_at: null };

let party: { server: Server; base: string };
before(async () => { party = await serve('/api/party', partyRoutes); });
after(() => party.server.close());
afterEach(() => mock.restoreAll());

async function start(members: object[]) {
    mockSupabase(USERS, (c) => {
        if (c.table === 'parties' && c.method === 'GET') return [{ id: 'p1', status: 'waiting', host_user_id: 'alice-id' }];
        if (c.table === 'party_members' && c.method === 'GET') return members.map((m, i) => ({ user_id: `u${i}`, ...m }));
        return [];
    });
    const centers: { latitude: number; longitude: number }[] = [];
    mock.method(axios, 'post', async (_url: string, body: any) => {
        centers.push(body.locationRestriction.circle.center);
        return { data: { places: [{ id: 'g1', displayName: { text: 'Cafe' }, primaryType: 'cafe', types: ['cafe'], location: { latitude: 40.74, longitude: -74.1 } }] } };
    });
    const res = await realFetch(`${party.base}/api/party/p1/start`, { method: 'POST', headers: auth('tok-alice') });
    return { res, center: centers[0] };
}

test('the midpoint uses only the members who have a location', async () => {
    const { res, center } = await start([HOBOKEN, NOTHING, NEWARK_LIVE()]);
    assert.equal(res.status, 200);
    assert.ok(Math.abs(center.latitude - 40.74) < 0.05, `lat ${center.latitude}`);
    assert.ok(Math.abs(center.longitude - -74.102) < 0.05, `lng ${center.longitude}`);
});

test('a solo party with only a custom place can start', async () => {
    const { res, center } = await start([HOBOKEN]);
    assert.equal(res.status, 200);
    assert.ok(Math.abs(center.latitude - 40.744) < 0.05);
    assert.ok(Math.abs(center.longitude - -74.032) < 0.05);
});

test('nobody with a location cannot start', async () => {
    const { res } = await start([NOTHING, NOTHING]);
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error, 'no_member_locations');
});

test('cards are ordered by round first so new rounds come after old cards', async () => {
    const calls = mockSupabase(USERS, (c) => {
        if (c.table === 'party_members') return [{ user_id: 'alice-id' }];
        return [];
    });
    const res = await realFetch(`${party.base}/api/party/p1/locations`, { headers: auth('tok-alice') });
    assert.equal(res.status, 200);
    const order = calls.find((c) => c.table === 'locations' && c.method === 'GET')?.url.searchParams.get('order') ?? '';
    assert.match(order, /^created_at\.asc,is_priority\.desc/);
});
