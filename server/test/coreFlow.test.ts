import './env';
import { test, before, after, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { bootApp, client, freshWorld, mockGoogle, tok, type Sent } from './flowApp';
import type { FakeSupabase } from './fakeSupabase';

let server: Server;
let base = '';
let fake: FakeSupabase;
let google: ReturnType<typeof mockGoogle>;
let sent: Sent[];
let call: ReturnType<typeof client>['call'];

const HOBOKEN = { latitude: 40.744, longitude: -74.032 };
const JERSEY_CITY = { latitude: 40.728, longitude: -74.078 };
const PLACES = { alice: HOBOKEN, bob: JERSEY_CITY, carol: { latitude: 40.75, longitude: -74.05 }, dave: { latitude: 40.73, longitude: -74.04 } } as Record<string, typeof HOBOKEN>;

before(async () => ({ server, base } = await bootApp()));
after(() => server.close());
beforeEach(() => {
    mock.method(console, 'error', () => {});
    mock.method(console, 'log', () => {});
    fake = freshWorld();
    google = mockGoogle();
    sent = [];
    call = client(base, sent).call;
});
afterEach(() => mock.restoreAll());

const partyRow = (id: string) => fake.db.parties.find((p) => p.id === id)!;

async function createParty(host = 'alice', name = 'Friday') {
    const r = await call('POST', '/api/party', tok(host), { name });
    assert.equal(r.status, 201, r.text);
    return r.json as { party_id: string; code: string };
}

async function join(code: string, who: string) {
    const r = await call('POST', '/api/party/join', tok(who), { code });
    assert.equal(r.status, 200, r.text);
    return r.json;
}

async function setLive(partyId: string, who: string) {
    const r = await call('PUT', `/api/party/${partyId}/location`, tok(who), { mode: 'live', ...PLACES[who] });
    assert.equal(r.status, 200, r.text);
    return r.json;
}

async function startedParty(members: string[]) {
    const { party_id, code } = await createParty(members[0]);
    for (const m of members.slice(1)) await join(code, m);
    for (const m of members) await setLive(party_id, m);
    const r = await call('POST', `/api/party/${party_id}/start`, tok(members[0]));
    assert.equal(r.status, 200, r.text);
    return party_id;
}

async function deck(partyId: string, who = 'alice'): Promise<string[]> {
    const r = await call('GET', `/api/party/${partyId}/locations`, tok(who));
    assert.equal(r.status, 200, r.text);
    return r.json.map((l: any) => l.id);
}

async function vote(partyId: string, who: string, locationId: string, yes: boolean) {
    const r = await call('POST', `/api/party/${partyId}/vote`, tok(who), { location_id: locationId, vote: yes });
    assert.equal(r.status, 200, r.text);
    return r.json as { ok: boolean; proposing: boolean; match: { matched: boolean } };
}

async function respond(partyId: string, who: string, accepted: boolean) {
    const r = await call('POST', `/api/party/${partyId}/proposal/respond`, tok(who), { accepted });
    assert.equal(r.status, 200, r.text);
}

async function linkedParty() {
    const partyId = await startedParty(['alice', 'bob']);
    const cards = await deck(partyId);
    for (const [i, card] of cards.entries()) {
        await vote(partyId, 'alice', card, i === 1);
        await vote(partyId, 'bob', card, i === 1);
    }
    await respond(partyId, 'alice', true);
    await respond(partyId, 'bob', true);
    assert.equal(partyRow(partyId).status, 'matched');
    return { partyId, linked: cards[1] };
}

test('sign in returns a session whose token opens protected routes, and a wrong password is refused', async () => {
    const ok = await call('POST', '/api/auth/login', undefined, { email: 'alice@test.dev', password: 'pw-alice' });
    assert.equal(ok.status, 200, ok.text);
    assert.equal(ok.json.user.id, 'alice');
    const me = await call('GET', '/api/auth/me', ok.json.session.access_token);
    assert.equal(me.status, 200, me.text);
    assert.equal(me.json.id, 'alice');
    const bad = await call('POST', '/api/auth/login', undefined, { email: 'alice@test.dev', password: 'nope' });
    assert.equal(bad.status, 401);
    assert.deepEqual(bad.json, { error: 'invalid_credentials', message: 'invalid_credentials' });
});

test('core routes reject a missing or invalid token before touching any data', async () => {
    const routes: [string, string][] = [
        ['POST', '/api/party'],
        ['POST', '/api/party/join'],
        ['GET', '/api/party/p1'],
        ['PUT', '/api/party/p1/location'],
        ['POST', '/api/party/p1/start'],
        ['POST', '/api/party/p1/vote'],
        ['POST', '/api/party/p1/proposal/respond'],
        ['POST', '/api/party/p1/dates'],
        ['POST', '/api/party/p1/dates/d1/lock'],
        ['GET', '/api/calendar/party/p1/ics'],
        ['POST', '/api/calendar/party/p1/export'],
    ];
    for (const [method, path] of routes) {
        const missing = await call(method, path);
        assert.equal(missing.status, 401, `${method} ${path}`);
        assert.equal(missing.json.error, 'missing_token');
        const invalid = await call(method, path, 'tok-nobody');
        assert.equal(invalid.status, 401, `${method} ${path}`);
        assert.equal(invalid.json.error, 'invalid_token');
    }
    assert.equal(fake.calls.filter((c) => c.table !== 'users').length, 0);
});

test('create a party, join it by code in any case, and only members can read it', async () => {
    const { party_id, code } = await createParty('alice', 'Friday');
    assert.match(code, /^[A-HJ-NP-Z2-9]{6}$/);
    assert.equal(partyRow(party_id).host_user_id, 'alice');
    assert.equal((await join(code.toLowerCase(), 'bob')).party_id, party_id);
    await join(code, 'bob');
    const missing = await call('POST', '/api/party/join', tok('carol'), { code: 'ZZZZZZ' });
    assert.equal(missing.status, 404);
    assert.equal(missing.json.error, 'party_not_found');
    const view = await call('GET', `/api/party/${party_id}`, tok('bob'));
    assert.equal(view.status, 200);
    assert.deepEqual(view.json.members.map((m: any) => m.user_id).sort(), ['alice', 'bob']);
    assert.deepEqual(view.json.my_location, { mode: 'live', custom_label: null, live_fresh: false });
    const outsider = await call('GET', `/api/party/${party_id}`, tok('mallory'));
    assert.equal(outsider.status, 403);
    assert.equal(outsider.json.error, 'not_a_member');
    assert.ok(!outsider.text.includes('Friday') && !outsider.text.includes(code));
});

test('members set a live or custom location and only see their own source, never coordinates', async () => {
    const { party_id, code } = await createParty();
    await join(code, 'bob');
    assert.deepEqual(await setLive(party_id, 'alice'), { mode: 'live', custom_label: null, live_fresh: true });
    const custom = await call('PUT', `/api/party/${party_id}/location`, tok('bob'), { mode: 'custom', ...JERSEY_CITY, label: '  Jersey City ' });
    assert.equal(custom.status, 200, custom.text);
    assert.deepEqual(custom.json, { mode: 'custom', custom_label: 'Jersey City', live_fresh: false });
    const mine = await call('GET', `/api/party/${party_id}`, tok('bob'));
    assert.deepEqual(mine.json.my_location, { mode: 'custom', custom_label: 'Jersey City', live_fresh: false });
    for (const r of sent) assert.ok(!r.text.includes('40.744') && !r.text.includes('74.078'), r.path);
    const bad = await call('PUT', `/api/party/${party_id}/location`, tok('bob'), { mode: 'custom', ...JERSEY_CITY });
    assert.equal(bad.status, 400);
    const outsider = await call('PUT', `/api/party/${party_id}/location`, tok('mallory'), { mode: 'live', ...HOBOKEN });
    assert.equal(outsider.status, 403);
});

test('only the host starts, a location is required, and starting loads venues once', async () => {
    const { party_id, code } = await createParty();
    await join(code, 'bob');
    const notHost = await call('POST', `/api/party/${party_id}/start`, tok('bob'));
    assert.equal(notHost.status, 403);
    assert.equal(notHost.json.error, 'not_host');
    const noLocation = await call('POST', `/api/party/${party_id}/start`, tok('alice'));
    assert.equal(noLocation.status, 400);
    assert.equal(noLocation.json.error, 'no_member_locations');
    await setLive(party_id, 'bob');
    const started = await call('POST', `/api/party/${party_id}/start`, tok('alice'));
    assert.equal(started.status, 200, started.text);
    assert.equal(started.json.venue_count, 3);
    assert.equal(google.places.mock.callCount(), 1);
    assert.deepEqual(
        { status: partyRow(party_id).status, index: partyRow(party_id).current_card_index, round: partyRow(party_id).voting_round },
        { status: 'swiping', index: 0, round: 1 },
    );
    const again = await call('POST', `/api/party/${party_id}/start`, tok('alice'));
    assert.equal(again.status, 409);
    assert.equal(again.json.error, 'party_already_started');
    assert.equal(google.places.mock.callCount(), 1);
});

test('a non-member gets 403 on every core-flow route and never sees party data', async () => {
    const { partyId } = await linkedParty();
    const dateId = (await call('POST', `/api/party/${partyId}/dates`, tok('alice'), { proposed_date: '2026-11-20T23:00:00.000Z' })).json.id;
    const card = fake.db.locations.find((l) => l.party_id === partyId)!.id;
    const routes: [string, string, unknown?][] = [
        ['GET', `/api/party/${partyId}`],
        ['GET', `/api/party/${partyId}/members`],
        ['PUT', `/api/party/${partyId}/location`, { mode: 'live', ...HOBOKEN }],
        ['GET', `/api/party/${partyId}/locations`],
        ['POST', `/api/party/${partyId}/vote`, { location_id: card, vote: true }],
        ['GET', `/api/party/${partyId}/votes`],
        ['POST', `/api/party/${partyId}/proposal/respond`, { accepted: true }],
        ['POST', `/api/party/${partyId}/force-match`],
        ['GET', `/api/party/${partyId}/match`],
        ['GET', `/api/party/${partyId}/dates`],
        ['POST', `/api/party/${partyId}/dates`, { proposed_date: '2026-11-21T23:00:00.000Z' }],
        ['POST', `/api/party/${partyId}/dates/${dateId}/vote`, { available: true }],
        ['POST', `/api/party/${partyId}/dates/${dateId}/lock`],
        ['POST', `/api/party/${partyId}/start`],
        ['GET', `/api/calendar/party/${partyId}/ics`],
        ['POST', `/api/calendar/party/${partyId}/export`],
    ];
    for (const [method, path, body] of routes) {
        const r = await call(method, path, tok('mallory'), body);
        assert.equal(r.status, 403, `${method} ${path}: ${r.text}`);
        assert.ok(!r.text.includes('Friday') && !r.text.includes('Venue'), `${method} ${path} leaked ${r.text}`);
    }
    assert.ok(!fake.db.votes.some((v) => v.user_id === 'mallory'));
    assert.ok(!fake.db.party_dates.some((d) => d.proposed_by === 'mallory'));
    assert.equal(google.inserts.length, 0);
});

test('two members vote every card in lockstep, the round ends in a proposal, and both accepting makes the Link', async () => {
    const partyId = await startedParty(['alice', 'bob']);
    const cards = await deck(partyId, 'bob');
    assert.equal(cards.length, 3);
    const first = await vote(partyId, 'alice', cards[0], true);
    assert.deepEqual([first.proposing, partyRow(partyId).current_card_index], [false, 0]);
    await vote(partyId, 'bob', cards[0], false);
    assert.equal(partyRow(partyId).current_card_index, 1);
    await vote(partyId, 'alice', cards[1], true);
    await vote(partyId, 'bob', cards[1], true);
    await vote(partyId, 'alice', cards[2], false);
    const last = await vote(partyId, 'bob', cards[2], false);
    assert.equal(last.proposing, true);
    assert.equal(partyRow(partyId).status, 'proposing');
    assert.equal(partyRow(partyId).proposal_location_id, cards[1]);
    const pending = await call('GET', `/api/party/${partyId}/match`, tok('alice'));
    assert.deepEqual(pending.json, { matched: false, status: 'proposing' });
    await respond(partyId, 'alice', true);
    assert.equal(partyRow(partyId).status, 'proposing');
    await respond(partyId, 'bob', true);
    const link = await call('GET', `/api/party/${partyId}/match`, tok('bob'));
    assert.equal(link.json.matched, true);
    assert.equal(link.json.status, 'matched');
    assert.equal(link.json.location.id, cards[1]);
    const late = await call('POST', `/api/party/${partyId}/proposal/respond`, tok('alice'), { accepted: true });
    assert.equal(late.status, 409);
    assert.equal(late.json.error, 'party_not_proposing');
});

test('a round where nobody likes anything loads more venues and starts round 2 after the old cards', async () => {
    const partyId = await startedParty(['alice', 'bob']);
    const cards = await deck(partyId);
    for (const card of cards) {
        await vote(partyId, 'alice', card, false);
        await vote(partyId, 'bob', card, false);
    }
    const row = partyRow(partyId);
    assert.deepEqual({ status: row.status, round: row.voting_round, index: row.current_card_index }, { status: 'swiping', round: 2, index: 3 });
    assert.equal(google.places.mock.callCount(), 2);
    const next = await deck(partyId);
    assert.equal(next.length, 6);
    assert.deepEqual(next.slice(0, 3), cards);
});

test('rejected proposals move to the next liked venue, and a third rejection starts a new round', async () => {
    const partyId = await startedParty(['alice', 'bob']);
    const cards = await deck(partyId);
    const likes: Record<string, boolean[]> = { alice: [true, true, true], bob: [true, true, false] };
    for (const [i, card] of cards.entries()) {
        await vote(partyId, 'alice', card, likes.alice[i]);
        await vote(partyId, 'bob', card, likes.bob[i]);
    }
    assert.equal(partyRow(partyId).status, 'proposing');
    const firstPick = partyRow(partyId).proposal_location_id;
    assert.ok([cards[0], cards[1]].includes(firstPick));
    await respond(partyId, 'alice', false);
    await respond(partyId, 'bob', true);
    assert.equal(partyRow(partyId).proposal_rank, 1);
    assert.notEqual(partyRow(partyId).proposal_location_id, firstPick);
    for (const rank of [1, 2]) {
        assert.equal(partyRow(partyId).proposal_rank, rank);
        await respond(partyId, 'alice', false);
        await respond(partyId, 'bob', false);
    }
    const row = partyRow(partyId);
    assert.deepEqual({ status: row.status, round: row.voting_round }, { status: 'swiping', round: 2 });
    assert.equal(row.rejected_location_ids.length, 3);
});

test('a solo party starts from a custom place, every vote advances, and pick early locks the latest like', async () => {
    const { party_id } = await createParty('alice');
    const custom = await call('PUT', `/api/party/${party_id}/location`, tok('alice'), { mode: 'custom', ...HOBOKEN, label: 'Hoboken' });
    assert.equal(custom.status, 200);
    assert.equal((await call('POST', `/api/party/${party_id}/start`, tok('alice'))).status, 200);
    const cards = await deck(party_id);
    const none = await call('POST', `/api/party/${party_id}/force-match`, tok('alice'));
    assert.deepEqual(none.json, { matched: false, reason: 'no_likes_yet' });
    await vote(party_id, 'alice', cards[0], false);
    assert.equal(partyRow(party_id).current_card_index, 1);
    await vote(party_id, 'alice', cards[1], true);
    assert.equal(partyRow(party_id).current_card_index, 2);
    const picked = await call('POST', `/api/party/${party_id}/force-match`, tok('alice'));
    assert.deepEqual(picked.json, { matched: true, location_id: cards[1] });
    assert.equal(partyRow(party_id).status, 'matched');

    const group = await startedParty(['carol', 'dave']);
    const notSolo = await call('POST', `/api/party/${group}/force-match`, tok('carol'));
    assert.equal(notSolo.status, 403);
    assert.equal(notSolo.json.error, 'not_solo_party');
});

function legacyParty(members: string[]) {
    const id = `legacy-${members.length}-${fake.db.parties.length}`;
    fake.db.parties.push({ id, code: `L${members.length}AAAA`.slice(0, 6), name: 'Legacy', host_user_id: members[0], status: 'swiping', current_card_index: null, voting_round: 1, rejected_location_ids: [] });
    for (const m of members) fake.db.party_members.push({ party_id: id, user_id: m, joined_at: new Date().toISOString() });
    const locationId = crypto.randomUUID();
    fake.db.locations.push({ id: locationId, party_id: id, google_place_id: `ChIJlegacy${id}`, name: 'Legacy Cafe', address: '1 Old St', latitude: 40.7, longitude: -74, created_at: new Date().toISOString() });
    return { id, locationId };
}

test('legacy majority rule: parties of two or fewer wait for everyone to vote', async () => {
    const { id, locationId } = legacyParty(['alice', 'bob']);
    assert.equal((await vote(id, 'alice', locationId, true)).match.matched, false);
    assert.equal(partyRow(id).status, 'swiping');
    const done = await vote(id, 'bob', locationId, true);
    assert.equal(done.match.matched, true);
    assert.equal(partyRow(id).matched_location_id, locationId);
});

for (const [size, yes, matched] of [[3, 1, false], [3, 2, true], [4, 2, false], [4, 3, true]] as const) {
    test(`legacy majority rule: ${yes} of ${size} yes votes ${matched ? 'is' : 'is not'} a strict majority`, async () => {
        const members = ['alice', 'bob', 'carol', 'dave'].slice(0, size);
        const { id, locationId } = legacyParty(members);
        for (const [i, m] of members.entries()) await vote(id, m, locationId, i < yes);
        assert.equal(partyRow(id).status, matched ? 'matched' : 'swiping');
    });
}

test('dates: members propose and vote, only the host locks, and the lock exports to connected calendars', async () => {
    const { partyId, linked } = await linkedParty();
    Object.assign(fake.db.users.find((u) => u.id === 'alice')!, { google_calendar_token: 'gcal-access-alice', google_calendar_refresh: 'gcal-refresh-alice' });
    const proposed = await call('POST', `/api/party/${partyId}/dates`, tok('bob'), { proposed_date: '2026-11-20T23:00:00.000Z' });
    assert.equal(proposed.status, 201, proposed.text);
    assert.deepEqual([proposed.json.starts_at, proposed.json.ends_at], ['2026-11-20T23:00:00.000Z', '2026-11-21T01:00:00.000Z']);
    assert.equal(partyRow(partyId).status, 'scheduled');
    const again = await call('POST', `/api/party/${partyId}/dates`, tok('alice'), { proposed_date: '2026-11-20T23:00:00.000Z' });
    assert.equal(again.json.id, proposed.json.id);
    const second = (await call('POST', `/api/party/${partyId}/dates`, tok('alice'), { proposed_date: '2026-11-19T23:00:00.000Z' })).json;
    const bad = await call('POST', `/api/party/${partyId}/dates`, tok('alice'), { proposed_date: 'someday' });
    assert.equal(bad.status, 400);

    for (const [who, dateId, available] of [['alice', proposed.json.id, true], ['bob', proposed.json.id, true], ['bob', second.id, false]] as const) {
        const r = await call('POST', `/api/party/${partyId}/dates/${dateId}/vote`, tok(who), { available });
        assert.equal(r.status, 200, r.text);
    }
    const list = await call('GET', `/api/party/${partyId}/dates`, tok('bob'));
    assert.deepEqual(
        list.json.map((d: any) => [d.id, d.vote_count, d.member_count, d.my_vote, d.is_locked]),
        [[proposed.json.id, 2, 2, true, false], [second.id, 0, 2, false, false]],
    );
    assert.equal(list.json[0].proposed_by.user_id, 'bob');

    const early = await call('GET', `/api/calendar/party/${partyId}/ics`, tok('alice'));
    assert.equal(early.status, 400);
    assert.equal(early.json.error, 'party_not_locked');
    const notHost = await call('POST', `/api/party/${partyId}/dates/${proposed.json.id}/lock`, tok('bob'));
    assert.equal(notHost.status, 403);
    assert.equal(notHost.json.error, 'not_host');
    const locked = await call('POST', `/api/party/${partyId}/dates/${proposed.json.id}/lock`, tok('alice'));
    assert.deepEqual(locked.json, { ok: true, gcal_exported: 1 });
    assert.deepEqual([partyRow(partyId).status, partyRow(partyId).locked_date_id], ['locked', proposed.json.id]);
    const venue = fake.db.locations.find((l) => l.id === linked)!;
    const event = google.inserts[0].requestBody;
    assert.deepEqual(
        { summary: event.summary, location: event.location, start: event.start, end: event.end, attendees: event.attendees },
        {
            summary: 'LinkdUp: Friday',
            location: `${venue.name} - ${venue.address}`,
            start: { dateTime: '2026-11-20T23:00:00.000Z' },
            end: { dateTime: '2026-11-21T01:00:00.000Z' },
            attendees: [{ email: 'alice@test.dev' }, { email: 'bob@test.dev' }],
        },
    );
    const deleteLocked = await call('DELETE', `/api/party/${partyId}/dates/${proposed.json.id}`, tok('alice'));
    assert.equal(deleteLocked.status, 409);
    assert.equal((await call('GET', `/api/party/${partyId}/dates`, tok('alice'))).json[0].is_locked, true);
});

test('the ICS export holds the locked date, the Link venue with escaped commas, and downloads as a file', async () => {
    const { partyId, linked } = await linkedParty();
    const dateId = (await call('POST', `/api/party/${partyId}/dates`, tok('bob'), { proposed_date: '2026-11-20T23:00:00.000Z' })).json.id;
    await call('POST', `/api/party/${partyId}/dates/${dateId}/lock`, tok('alice'));
    const venue = fake.db.locations.find((l) => l.id === linked)!;
    const r = await call('GET', `/api/calendar/party/${partyId}/ics`, tok('bob'));
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type') ?? '', /^text\/calendar/);
    assert.equal(r.headers.get('content-disposition'), 'attachment; filename="linkdup-meetup.ics"');
    const lines = r.text.split('\r\n');
    assert.deepEqual(lines.slice(0, 4), ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//LinkdUp//Capstone//EN', 'BEGIN:VEVENT']);
    assert.deepEqual(lines.slice(-2), ['END:VEVENT', 'END:VCALENDAR']);
    assert.ok(lines.includes('DTSTART:20261120T230000Z'));
    assert.ok(lines.includes('DTEND:20261121T010000Z'));
    assert.ok(lines.includes('SUMMARY:LinkdUp: Friday'));
    assert.ok(lines.includes(`LOCATION:${venue.name} - ${venue.address.replace(/,/g, '\\,')}`), r.text);
    assert.ok(lines.some((l) => /^UID:linkdup-\d+@linkdup\.app$/.test(l)));
});

test('Google export creates the event for a connected member and stores its id', async () => {
    const { partyId } = await linkedParty();
    Object.assign(fake.db.users.find((u) => u.id === 'bob')!, { google_calendar_token: 'gcal-access-bob', google_calendar_refresh: 'gcal-refresh-bob' });
    const early = await call('POST', `/api/calendar/party/${partyId}/export`, tok('bob'));
    assert.equal(early.status, 400);
    assert.equal(early.json.error, 'party_not_locked');
    const dateId = (await call('POST', `/api/party/${partyId}/dates`, tok('bob'), { proposed_date: '2026-11-20T23:00:00.000Z' })).json.id;
    await call('POST', `/api/party/${partyId}/dates/${dateId}/lock`, tok('alice'));
    const before = google.inserts.length;
    const r = await call('POST', `/api/calendar/party/${partyId}/export`, tok('bob'));
    assert.equal(r.status, 200, r.text);
    assert.deepEqual(r.json, { ok: true, event_id: `evt-${before + 1}`, html_link: `https://calendar.google.com/event?eid=${before + 1}` });
    assert.equal(partyRow(partyId).gcal_event_id, `evt-${before + 1}`);
    assert.deepEqual(google.inserts.at(-1).requestBody.attendees, [{ email: 'alice@test.dev' }, { email: 'bob@test.dev' }]);
});

test.skip('BUG: Google export for a member who never connected Google returns 500 server_error instead of a clear 4xx', async () => {
    const { partyId } = await linkedParty();
    const dateId = (await call('POST', `/api/party/${partyId}/dates`, tok('bob'), { proposed_date: '2026-11-20T23:00:00.000Z' })).json.id;
    await call('POST', `/api/party/${partyId}/dates/${dateId}/lock`, tok('alice'));
    const r = await call('POST', `/api/calendar/party/${partyId}/export`, tok('bob'));
    assert.ok(r.status >= 400 && r.status < 500, `${r.status} ${r.text}`);
});

test('no response across the whole core flow carries a token, password or server secret', async () => {
    Object.assign(fake.db.users.find((u) => u.id === 'alice')!, { google_calendar_token: 'gcal-access-alice', google_calendar_refresh: 'gcal-refresh-alice' });
    await call('POST', '/api/auth/login', undefined, { email: 'alice@test.dev', password: 'pw-alice' });
    await call('GET', '/api/auth/me', tok('alice'));
    const { partyId } = await linkedParty();
    const dateId = (await call('POST', `/api/party/${partyId}/dates`, tok('bob'), { proposed_date: '2026-11-20T23:00:00.000Z' })).json.id;
    await call('POST', `/api/party/${partyId}/dates/${dateId}/vote`, tok('alice'), { available: true });
    await call('GET', `/api/party/${partyId}/dates`, tok('alice'));
    await call('POST', `/api/party/${partyId}/dates/${dateId}/lock`, tok('alice'));
    await call('GET', `/api/party/${partyId}`, tok('alice'));
    await call('GET', `/api/party/${partyId}/members`, tok('alice'));
    await call('GET', `/api/party/${partyId}/locations`, tok('alice'));
    await call('GET', `/api/party/${partyId}/match`, tok('alice'));
    await call('GET', `/api/calendar/party/${partyId}/ics`, tok('alice'));
    await call('POST', `/api/calendar/party/${partyId}/export`, tok('alice'));
    await call('GET', `/api/party/${partyId}/votes`, tok('alice'));
    assert.ok(sent.length > 20);
    const secrets = [
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        process.env.GOOGLE_MAPS_API_KEY!,
        process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
        'gcal-access-alice',
        'gcal-refresh-alice',
        'pw-alice',
    ];
    const forbiddenKeys = /"(google_calendar_token|google_calendar_refresh|password|service_role[a-z_]*|refresh_token|access_token)"\s*:/;
    for (const r of sent) {
        for (const secret of secrets) assert.ok(!r.text.includes(secret), `${r.method} ${r.path} leaked a secret`);
        if (r.path === '/api/auth/login') continue;
        assert.ok(!forbiddenKeys.test(r.text), `${r.method} ${r.path} returned a token field: ${r.text.slice(0, 200)}`);
    }
});
