import './env';
import { test, mock, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import healthRoutes, { HEALTH_DB_LIMIT } from '../src/routes/health';
import { mockSupabase, serve, realFetch } from './supabaseMock';

let server: Server;
let base = '';
before(async () => ({ server, base } = await serve('/api/health', healthRoutes)));
after(() => server.close());
afterEach(() => mock.restoreAll());

test('db health runs one trivial query without auth and returns only ok', async () => {
    const calls = mockSupabase({}, () => [{ id: 'secret-row-id', name: 'Secret School' }]);
    const res = await realFetch(`${base}/api/health/db`);
    assert.equal(res.status, 200);
    assert.equal(await res.text(), '{"ok":true}');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, 'GET');
});

test('db health returns 503 without details when Supabase fails', async () => {
    mock.method(console, 'error', () => {});
    mock.method(globalThis, 'fetch', async () => Response.json({ message: 'connection refused at db.internal:5432' }, { status: 500 }));
    const res = await realFetch(`${base}/api/health/db`);
    assert.equal(res.status, 503);
    assert.equal(await res.text(), '{"ok":false}');
});

test('db health is rate limited', async () => {
    mockSupabase({});
    let last: Response | undefined;
    for (let i = 0; i <= HEALTH_DB_LIMIT; i++) {
        last = await realFetch(`${base}/api/health/db`);
        await last.arrayBuffer();
    }
    assert.equal(last!.status, 429);
});
