import './env';
import { test, before, after, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import feedRoutes from '../src/routes/feed';
import friendsRoutes from '../src/routes/friends';
import userRoutes from '../src/routes/user';
import discoverRoutes from '../src/routes/discover';
import { mockSupabase, serve, auth, realFetch, type Call } from './supabaseMock';

const DEMO = 'de300000-0000-4000-8000-0000000000d1';
const FRIEND = 'de300000-0000-4000-8000-0000000000f1';
const REAL = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const STRANGER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const USERS = { 'tok-real': REAL, 'tok-demo': DEMO };

const near = { location_mode: 'custom', custom_latitude: 40.74, custom_longitude: -74.03, custom_label: 'Hoboken', live_latitude: null, live_longitude: null, live_at: null };
const world: Record<string, any[]> = {
    users: [DEMO, FRIEND, REAL, OTHER].map((id) => ({ id, display_name: `Sam ${id.slice(0, 2)}`, username: `sam_${id.slice(0, 2)}`, avatar_url: null, avatar_color: '#6C3EF4' })),
    feed_posts: [
        { id: 'demo-post', creator_id: FRIEND, image_url: '/demo/post.jpg', caption: 'Demo post', venue_name: 'Demo', created_at: '2026-10-01T00:00:00Z' },
        { id: 'demo-own-post', creator_id: DEMO, image_url: '/demo/post.jpg', caption: 'Demo post', venue_name: 'Demo', created_at: '2026-10-02T00:00:00Z' },
        { id: 'real-post', creator_id: OTHER, image_url: 'https://x/p.jpg', caption: 'Real post', venue_name: 'Real', created_at: '2026-10-03T00:00:00Z' },
    ],
    user_follows: [
        { follower_id: DEMO, followed_id: FRIEND, followed_at: '2026-09-01T00:00:00Z' },
        { follower_id: FRIEND, followed_id: DEMO, followed_at: '2026-09-01T00:00:00Z' },
        { follower_id: FRIEND, followed_id: REAL, followed_at: '2026-09-02T00:00:00Z' },
        { follower_id: OTHER, followed_id: REAL, followed_at: '2026-09-03T00:00:00Z' },
        { follower_id: FRIEND, followed_id: STRANGER, followed_at: '2026-10-01T00:00:00Z' },
        { follower_id: OTHER, followed_id: STRANGER, followed_at: '2026-10-02T00:00:00Z' },
        { follower_id: STRANGER, followed_id: DEMO, followed_at: '2026-10-03T00:00:00Z' },
        { follower_id: STRANGER, followed_id: OTHER, followed_at: '2026-10-04T00:00:00Z' },
    ],
    parties: [
        { id: 'demo-party', name: 'Demo: Trivia', code: 'DEMOA1', status: 'waiting', host_user_id: FRIEND, is_public: true },
        { id: 'real-party', name: 'Real Party', code: 'REAL22', status: 'waiting', host_user_id: OTHER, is_public: true },
    ],
    party_members: [
        { party_id: 'demo-party', user_id: FRIEND, ...near },
        { party_id: 'real-party', user_id: OTHER, ...near },
    ],
};

function rows(call: Call) {
    let out = world[call.table] ?? [];
    for (const [col, expr] of call.url.searchParams) {
        if (expr.startsWith('eq.')) out = out.filter((r) => String(r[col]) === expr.slice(3));
        if (expr.startsWith('neq.')) out = out.filter((r) => String(r[col]) !== expr.slice(4));
        if (expr.startsWith('in.(')) {
            const values = expr.slice(4, -1).split(',').map((v) => v.replace(/^"|"$/g, ''));
            out = out.filter((r) => values.includes(String(r[col])));
        }
    }
    return out;
}

const servers: { server: Server; base: string }[] = [];
let feed = '';
let friends = '';
let user = '';
let discover = '';
before(async () => {
    for (const [path, router] of [['/api/discover', feedRoutes], ['/api/friends', friendsRoutes], ['/api/user', userRoutes], ['/api/discover', discoverRoutes]] as const) {
        servers.push(await serve(path, router));
    }
    [feed, friends, user, discover] = servers.map((s) => s.base);
});
after(() => servers.forEach((s) => s.server.close()));
beforeEach(() => {
    process.env.DEMO_USER_ID = DEMO;
    mock.method(console, 'error', () => {});
    mockSupabase(USERS, rows);
});
afterEach(() => {
    mock.restoreAll();
    delete process.env.DEMO_USER_ID;
});

async function get(base: string, path: string, token: string) {
    const res = await realFetch(`${base}${path}`, { headers: auth(token) });
    const text = await res.text();
    assert.equal(res.status, 200, `${path} ${text}`);
    return JSON.parse(text);
}

const DEMO_IDS = [DEMO, FRIEND];

test('a normal user never sees demo posts in the feed', async () => {
    const { posts } = await get(feed, '/api/discover/feed', 'tok-real');
    assert.deepEqual(posts.map((p: any) => p.id), ['real-post']);
});

test('the demo user still sees demo posts in the feed', async () => {
    const { posts } = await get(feed, '/api/discover/feed', 'tok-demo');
    assert.deepEqual(posts.map((p: any) => p.id).sort(), ['demo-own-post', 'demo-post', 'real-post']);
});

test('friend search never returns the demo user or demo friends to a normal user', async () => {
    const found = await get(friends, '/api/friends/search?q=Sam', 'tok-real');
    assert.deepEqual(found.map((u: any) => u.id), [OTHER]);
    assert.ok(!found.some((u: any) => DEMO_IDS.includes(u.id)));
});

test('friend search still shows demo friends to the demo user', async () => {
    const found = await get(friends, '/api/friends/search?q=Sam', 'tok-demo');
    assert.deepEqual(found.map((u: any) => u.id).sort(), [FRIEND, REAL, OTHER].sort());
});

test('followers and following lists hide demo users from a normal user', async () => {
    const followers = await get(user, `/api/user/${STRANGER}/followers`, 'tok-real');
    assert.deepEqual(followers.map((u: any) => u.id), [OTHER]);
    const following = await get(user, `/api/user/${STRANGER}/following`, 'tok-real');
    assert.deepEqual(following.map((u: any) => u.id), [OTHER]);
});

test('followers and following lists still show demo users to the demo user', async () => {
    const followers = await get(user, `/api/user/${STRANGER}/followers`, 'tok-demo');
    assert.deepEqual(followers.map((u: any) => u.id).sort(), [FRIEND, OTHER].sort());
    const following = await get(user, `/api/user/${STRANGER}/following`, 'tok-demo');
    assert.deepEqual(following.map((u: any) => u.id).sort(), [DEMO, OTHER].sort());
});

test('someone who follows the demo account still shows up for a normal user', async () => {
    const followers = await get(user, `/api/user/${OTHER}/followers`, 'tok-real');
    assert.deepEqual(followers.map((u: any) => u.id), [STRANGER]);
});

test('the follow back list never shows a demo friend to a normal user', async () => {
    const followBack = await get(friends, '/api/friends/follow-back', 'tok-real');
    assert.deepEqual(followBack.map((u: any) => u.id), [OTHER]);
});

test('the demo user still has their demo friends', async () => {
    const list = await get(friends, '/api/friends', 'tok-demo');
    assert.deepEqual(list.map((u: any) => u.id), [FRIEND]);
});

test('Discover parties never show demo parties to a normal user', async () => {
    const parties = await get(discover, '/api/discover/parties?lat=40.74&lng=-74.03', 'tok-real');
    assert.deepEqual(parties.map((p: any) => p.id), ['real-party']);
});

test('Discover parties still show demo parties to the demo user', async () => {
    const parties = await get(discover, '/api/discover/parties?lat=40.74&lng=-74.03', 'tok-demo');
    assert.deepEqual(parties.map((p: any) => p.id).sort(), ['demo-party', 'real-party']);
});

test('nothing is hidden when demo mode is off', async () => {
    delete process.env.DEMO_USER_ID;
    const { posts } = await get(feed, '/api/discover/feed', 'tok-real');
    assert.equal(posts.length, 3);
    const found = await get(friends, '/api/friends/search?q=Sam', 'tok-real');
    assert.equal(found.length, 3);
});
