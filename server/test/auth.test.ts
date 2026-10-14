import './env';
import { test, mock, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import authRoutes from '../src/routes/auth';
import { supabaseAdmin } from '../src/db';
import { serve, realFetch } from './supabaseMock';

let server: Server;
let base = '';
before(async () => ({ server, base } = await serve('/api/auth', authRoutes)));
after(() => server.close());
afterEach(() => mock.restoreAll());

test('login does not leave a user session on the service role client', async () => {
    const restAuth: string[] = [];
    mock.method(globalThis, 'fetch', async (input: any, init: RequestInit = {}) => {
        const url = new URL(String(input));
        if (url.pathname === '/auth/v1/token') {
            return Response.json({
                access_token: 'user-jwt',
                refresh_token: 'r',
                expires_in: 3600,
                expires_at: Math.floor(Date.now() / 1000) + 3600,
                token_type: 'bearer',
                user: { id: 'u1', email: 'a@b.co', aud: 'authenticated' },
            });
        }
        restAuth.push(new Headers(init.headers).get('authorization') ?? '');
        return Response.json([]);
    });
    const res = await realFetch(`${base}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'a@b.co', password: 'pw' }),
    });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).session.access_token, 'user-jwt');
    await supabaseAdmin.from('users').select('id');
    assert.deepEqual(restAuth, [`Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`]);
});
