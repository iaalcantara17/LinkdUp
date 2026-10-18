import './env';
import { test, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import express from 'express';
import reportsRoutes, { REPORT_IP_LIMIT, REPORT_USER_LIMIT } from '../src/routes/reports';
import { errorHandler } from '../src/middleware/error';
import { mockSupabase, realFetch, type Call } from './supabaseMock';
import { bootApp } from './flowApp';

const BOB = '22222222-2222-4222-8222-222222222222';
const DEMO = 'de300000-0000-4000-8000-0000000000d1';

let ipSeq = 0;
const freshIp = () => `10.0.${Math.floor(++ipSeq / 250)}.${ipSeq % 250}`;
let userSeq = 0;
const pool: Record<string, string> = {};
function reporter() {
    const n = ++userSeq;
    const id = `33333333-3333-4333-8333-${String(n).padStart(12, '0')}`;
    pool[`tok-u${n}`] = id;
    return { token: `tok-u${n}`, id };
}

afterEach(() => {
    mock.restoreAll();
    delete process.env.DEMO_USER_ID;
});

async function withApp(fn: (post: (body: unknown, opts?: { token?: string; ip?: string }) => Promise<{ status: number; json: any }>) => Promise<void>) {
    const app = express();
    app.set('trust proxy', true);
    app.use(express.json());
    app.use('/api/reports', reportsRoutes);
    app.use(errorHandler);
    const server = app.listen(0);
    await once(server, 'listening');
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const ip = freshIp();
    try {
        await fn(async (body, opts = {}) => {
            const res = await realFetch(`${base}/api/reports`, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'x-forwarded-for': opts.ip ?? ip,
                    ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
                },
                body: JSON.stringify(body),
            });
            const text = await res.text();
            return { status: res.status, json: text ? JSON.parse(text) : null };
        });
    } finally {
        server.close();
    }
}

function world(insert?: () => Response) {
    mock.method(console, 'error', () => {});
    const users: Record<string, string> = { 'tok-demo': DEMO, ...pool };
    const calls = mockSupabase(users, (call: Call) => {
        if (call.table !== 'reports') return [];
        if (call.method === 'POST') return insert?.() ?? [];
        return [];
    });
    return {
        calls,
        inserts: () => calls.filter((c) => c.table === 'reports' && c.method === 'POST').map((c) => c.body),
    };
}

const good = { reported_user_id: BOB, reason: 'spam' };

test('reporting needs a signed in user', async () => {
    const w = world();
    await withApp(async (post) => {
        const res = await post(good);
        assert.equal(res.status, 401);
        assert.deepEqual(w.inserts(), []);
    });
});

test('a report saves one row with the reporter, target, reason and trimmed note and returns only ok', async () => {
    const me = reporter();
    const w = world();
    await withApp(async (post) => {
        const res = await post({ ...good, details: '  keeps sending links  ' }, { token: me.token });
        assert.equal(res.status, 200);
        assert.deepEqual(res.json, { ok: true });
        assert.deepEqual(w.inserts(), [{ reporter_id: me.id, reported_user_id: BOB, reason: 'spam', details: 'keeps sending links' }]);
    });
});

test('a null note is accepted and padding does not count toward the limit', async () => {
    const me = reporter();
    const w = world();
    await withApp(async (post) => {
        assert.equal((await post({ ...good, details: null }, { token: me.token })).status, 200);
        assert.equal((await post({ ...good, details: `${'x'.repeat(500)}

  ` }, { token: me.token })).status, 200);
        assert.deepEqual(w.inserts().map((r) => r.details?.length ?? null), [null, 500]);
    });
});

test('a blank note is stored as null', async () => {
    const me = reporter();
    const w = world();
    await withApp(async (post) => {
        assert.equal((await post({ ...good, reason: 'other', details: '   ' }, { token: me.token })).status, 200);
        assert.equal(w.inserts()[0].details, null);
    });
});

for (const [name, body] of [
    ['an unknown reason', { ...good, reason: 'rude' }],
    ['a missing reason', { reported_user_id: BOB }],
    ['a note over 500 characters', { ...good, details: 'x'.repeat(501) }],
    ['a target that is not a uuid', { ...good, reported_user_id: 'bob' }],
    ['an extra field', { ...good, reporter_id: BOB }],
] as const) {
    test(`${name} is rejected with 400 and nothing is saved`, async () => {
        const me = reporter();
        const w = world();
        await withApp(async (post) => {
            const res = await post(body, { token: me.token });
            assert.equal(res.status, 400);
            assert.deepEqual(w.inserts(), []);
        });
    });
}

test('a 500 character note is accepted', async () => {
    const me = reporter();
    const w = world();
    await withApp(async (post) => {
        assert.equal((await post({ ...good, details: 'x'.repeat(500) }, { token: me.token })).status, 200);
        assert.equal(w.inserts().length, 1);
    });
});

test('nobody can report themselves', async () => {
    const me = reporter();
    const w = world();
    await withApp(async (post) => {
        const res = await post({ ...good, reported_user_id: me.id.toUpperCase() }, { token: me.token });
        assert.equal(res.status, 400);
        assert.equal(res.json.error, 'cannot_report_self');
        assert.deepEqual(w.inserts(), []);
    });
});

test('the migration keeps one report per reporter, target and UTC day, locks the table and keeps reports when accounts go', () => {
    const sql = readFileSync(new URL('../src/db/migrations/036_reports.sql', import.meta.url), 'utf8').replace(/\s+/g, ' ');
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.reports/);
    assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS reports_one_per_day_idx ON public\.reports \(reporter_id, reported_user_id, \(\(created_at AT TIME ZONE 'UTC'\)::date\)\)/);
    assert.match(sql, /reason text NOT NULL CHECK \(reason IN \('spam', 'harassment', 'inappropriate', 'other'\)\)/);
    assert.match(sql, /char_length\(details\) <= 500/);
    assert.match(sql, /ALTER TABLE public\.reports ENABLE ROW LEVEL SECURITY/);
    assert.match(sql, /REVOKE ALL ON public\.reports FROM anon, authenticated/);
    assert.doesNotMatch(sql, /CREATE POLICY/);
    assert.doesNotMatch(sql, /ON DELETE CASCADE/);
    assert.equal(sql.match(/ON DELETE SET NULL/g)?.length, 2);
});

test('a report makes a single call to the reports table', async () => {
    const me = reporter();
    const w = world();
    await withApp(async (post) => {
        assert.equal((await post(good, { token: me.token })).status, 200);
        assert.deepEqual(w.calls.filter((c) => c.table === 'reports').map((c) => c.method), ['POST']);
    });
});

test('a second report of the same person on the same day is caught by the database and still says ok', async () => {
    const me = reporter();
    world(() => Response.json({ code: '23505', message: 'duplicate key value violates unique constraint' }, { status: 409 }));
    await withApp(async (post) => {
        const res = await post(good, { token: me.token });
        assert.equal(res.status, 200);
        assert.deepEqual(res.json, { ok: true });
    });
});

test('reporting someone who does not exist is a 404', async () => {
    const me = reporter();
    world(() => Response.json({ code: '23503', message: 'insert or update violates foreign key constraint' }, { status: 409 }));
    await withApp(async (post) => {
        const res = await post(good, { token: me.token });
        assert.equal(res.status, 404);
        assert.equal(res.json.error, 'user_not_found');
    });
});

test('other database errors are a 500 without details', async () => {
    const me = reporter();
    world(() => Response.json({ code: 'XX000', message: 'secret internals' }, { status: 500 }));
    await withApp(async (post) => {
        const res = await post(good, { token: me.token });
        assert.equal(res.status, 500);
        assert.deepEqual(res.json, { error: 'report_failed' });
    });
});

test('each user is rate limited across IPs', async () => {
    const busy = reporter();
    const other = reporter();
    world();
    await withApp(async (post) => {
        for (let i = 0; i < REPORT_USER_LIMIT; i++) {
            assert.equal((await post(good, { token: busy.token, ip: freshIp() })).status, 200);
        }
        const res = await post(good, { token: busy.token, ip: freshIp() });
        assert.equal(res.status, 429);
        assert.deepEqual(res.json, { error: 'rate_limited' });
        assert.equal((await post(good, { token: other.token, ip: freshIp() })).status, 200);
    });
});

test('each IP is rate limited before sign in is checked', async () => {
    const me = reporter();
    world();
    await withApp(async (post) => {
        for (let i = 0; i < REPORT_IP_LIMIT; i++) assert.equal((await post(good)).status, 401);
        const res = await post(good, { token: me.token });
        assert.equal(res.status, 429);
        assert.equal((await post(good, { token: me.token, ip: freshIp() })).status, 200);
    });
});

test('the demo user cannot report', async () => {
    process.env.DEMO_USER_ID = DEMO;
    const w = world();
    await withApp(async (post) => {
        const res = await post(good, { token: 'tok-demo' });
        assert.equal(res.status, 403);
        assert.deepEqual(res.json, { error: 'demo_read_only' });
        assert.deepEqual(w.inserts(), []);
    });
});

test('the app serves POST /api/reports', async () => {
    mock.method(console, 'error', () => {});
    const { server, base } = await bootApp();
    try {
        const res = await realFetch(`${base}/api/reports`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
        assert.equal(res.status, 401);
    } finally {
        server.close();
    }
});
