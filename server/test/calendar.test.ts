import './env';
import { test, mock, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { google } from 'googleapis';
import calendarRoutes from '../src/routes/calendar';
import { signState, verifyState } from '../src/services/googleCalendar';
import { mockSupabase, serve, auth, realFetch, Call } from './supabaseMock';

const USERS = { 'tok-alice': 'alice', 'tok-mallory': 'mallory' };
const membersOnly = (call: Call) => {
    if (call.table === 'party_members' && call.url.searchParams.get('user_id') === 'eq.alice') return [{ user_id: 'alice' }];
    if (call.table === 'parties') return [{ id: 'p1', locked_date_id: 'd1', matched_location_id: 'l1', name: 'Fun' }];
    if (call.table === 'locations') return [{ name: 'Cafe', address: '1 Main' }];
    if (call.table === 'party_dates') return [{ starts_at: '2026-10-20T18:00:00.000Z', ends_at: '2026-10-20T20:00:00.000Z' }];
    return [];
};

let server: Server;
let base = '';
before(async () => ({ server, base } = await serve('/api/calendar', calendarRoutes)));
after(() => server.close());
afterEach(() => mock.restoreAll());

test('ics rejects a non-member', async () => {
    mockSupabase(USERS, membersOnly);
    const res = await realFetch(`${base}/api/calendar/party/p1/ics`, { headers: auth('tok-mallory') });
    assert.equal(res.status, 403);
    assert.ok(!(await res.text()).includes('Cafe'));
});

test('ics works for a member', async () => {
    mockSupabase(USERS, membersOnly);
    const res = await realFetch(`${base}/api/calendar/party/p1/ics`, { headers: auth('tok-alice') });
    assert.equal(res.status, 200);
    assert.match(await res.text(), /LOCATION:Cafe - 1 Main/);
});

test('export rejects a non-member before touching Google', async () => {
    const calls = mockSupabase(USERS, membersOnly);
    const res = await realFetch(`${base}/api/calendar/party/p1/export`, { method: 'POST', headers: auth('tok-mallory') });
    assert.equal(res.status, 403);
    assert.ok(!calls.some((c) => c.table === 'users' && c.method === 'GET'));
    assert.ok(!calls.some((c) => c.table === 'parties' && c.method === 'PATCH'));
});

test('oauth start no longer uses the raw user id as state', async () => {
    mockSupabase(USERS);
    const res = await realFetch(`${base}/api/calendar/oauth/start`, { headers: auth('tok-alice') });
    const state = new URL((await res.json()).url).searchParams.get('state')!;
    assert.notEqual(state, 'alice');
    assert.equal(verifyState(state), 'alice');
});

function callback(state: string) {
    return realFetch(`${base}/api/calendar/oauth/callback?code=abc&state=${encodeURIComponent(state)}`);
}

function mockTokenExchange() {
    return mock.method(google.auth.OAuth2.prototype, 'getToken', async () => ({ tokens: { access_token: 'at', refresh_token: 'rt' } }));
}

for (const [name, state] of [
    ['raw user id', 'alice'],
    ['tampered user', signState('alice').replace(/^alice/, 'mallory')],
    ['tampered signature', signState('alice').slice(0, -2) + 'xx'],
    ['expired', signState('alice', Date.now() - 60 * 60 * 1000)],
    ['empty', ''],
]) {
    test(`callback rejects ${name} state without storing tokens`, async () => {
        const calls = mockSupabase(USERS);
        const exchange = mockTokenExchange();
        const res = await callback(state);
        assert.equal(res.status, 400);
        assert.equal(exchange.mock.callCount(), 0);
        assert.ok(!calls.some((c) => c.table === 'users'));
    });
}

test('callback with a valid state stores tokens for that user', async () => {
    const calls = mockSupabase(USERS);
    mockTokenExchange();
    const res = await callback(signState('alice'));
    assert.equal(res.status, 200);
    const write = calls.find((c) => c.table === 'users' && c.method === 'PATCH')!;
    assert.equal(write.url.searchParams.get('id'), 'eq.alice');
    assert.equal(write.body.google_calendar_token, 'at');
});
