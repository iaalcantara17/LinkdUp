import './env';
import { test, before, after, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { bootApp, client, freshWorld, tok } from './flowApp';
import type { FakeSupabase } from './fakeSupabase';
import { supabaseAdmin } from '../src/db';
import { DEMO_LIMIT } from '../src/routes/auth';

const DEMO = 'de300000-0000-4000-8000-0000000000d1';
const DEMO_EMAIL = 'demo@linkdup.app';
const DEMO_PASSWORD = randomUUID();

let server: Server;
let base = '';
let fake: FakeSupabase;
let call: ReturnType<typeof client>['call'];
let logged: string[];

before(async () => ({ server, base } = await bootApp()));
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
    call = client(base).call;
});
afterEach(() => {
    mock.restoreAll();
    delete process.env.DEMO_USER_ID;
    delete process.env.DEMO_USER_EMAIL;
    delete process.env.DEMO_USER_PASSWORD;
});

test('demo-available reports whether the demo is set up', async () => {
    assert.deepEqual((await call('GET', '/api/auth/demo-available')).json, { available: true });
    delete process.env.DEMO_USER_PASSWORD;
    assert.deepEqual((await call('GET', '/api/auth/demo-available')).json, { available: false });
});

test('demo sign in returns a normal session for the demo user and never sends or logs the credentials', async () => {
    const res = await call('POST', '/api/auth/demo');
    assert.equal(res.status, 200, res.text);
    assert.equal(res.json.user.id, DEMO);
    assert.equal(res.json.session.access_token, tok(DEMO));
    assert.ok(res.json.session.refresh_token);
    assert.ok(!res.text.includes(DEMO_PASSWORD));
    assert.ok(!res.text.includes(DEMO_EMAIL));
    assert.ok(!logged.some((l) => l.includes(DEMO_PASSWORD)));
});

test('demo sign in returns 404 when any demo env var is unset', async () => {
    for (const name of ['DEMO_USER_ID', 'DEMO_USER_EMAIL', 'DEMO_USER_PASSWORD']) {
        const saved = process.env[name];
        delete process.env[name];
        const res = await call('POST', '/api/auth/demo');
        assert.equal(res.status, 404, `${name}: ${res.text}`);
        assert.equal(res.json.session, undefined);
        process.env[name] = saved;
    }
});

test('demo sign in resets a changed demo password and retries once', async () => {
    fake.setPassword(DEMO, ['changed', 'by', 'a', 'visitor'].join('-'));
    mock.method(supabaseAdmin.auth.admin, 'getUserById', async (id: string) => ({ data: { user: { id, email: DEMO_EMAIL } }, error: null }));
    const update = mock.method(supabaseAdmin.auth.admin, 'updateUserById', async (id: string, attrs: any) => {
        fake.setPassword(id, attrs.password);
        return { data: { user: { id } }, error: null };
    });
    const res = await call('POST', '/api/auth/demo');
    assert.equal(res.status, 200, res.text);
    assert.equal(update.mock.callCount(), 1);
    assert.deepEqual(update.mock.calls[0].arguments, [DEMO, { password: DEMO_PASSWORD }]);
    assert.ok(!logged.some((l) => l.includes(DEMO_PASSWORD)));
});

test('demo sign in does not reset a password when the demo id and email disagree', async () => {
    fake.setPassword(DEMO, ['changed', 'by', 'a', 'visitor'].join('-'));
    mock.method(supabaseAdmin.auth.admin, 'getUserById', async (id: string) => ({ data: { user: { id, email: 'someone@else.dev' } }, error: null }));
    const update = mock.method(supabaseAdmin.auth.admin, 'updateUserById', async () => ({ data: { user: null }, error: null }));
    const res = await call('POST', '/api/auth/demo');
    assert.equal(res.status, 500, res.text);
    assert.equal(res.json.error, 'demo_misconfigured');
    assert.equal(update.mock.callCount(), 0);
});

test('demo sign in refuses when the demo email belongs to a different user', async () => {
    process.env.DEMO_USER_EMAIL = 'alice@test.dev';
    process.env.DEMO_USER_PASSWORD = ['pw', 'alice'].join('-');
    const res = await call('POST', '/api/auth/demo');
    assert.equal(res.status, 500, res.text);
    assert.equal(res.json.error, 'demo_misconfigured');
    assert.equal(res.json.session, undefined);
});

test('demo sign in is rate limited per IP', async () => {
    let last = await call('POST', '/api/auth/demo');
    for (let i = 0; i < DEMO_LIMIT && last.status !== 429; i++) last = await call('POST', '/api/auth/demo');
    assert.equal(last.status, 429);
    assert.deepEqual(last.json, { error: 'rate_limited' });
});
