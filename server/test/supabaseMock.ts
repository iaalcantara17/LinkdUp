import { mock } from 'node:test';
import express, { Router } from 'express';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { errorHandler } from '../src/middleware/error';

export const realFetch = globalThis.fetch;

export type Call = { method: string; table: string; url: URL; body: any };
export type Rows = (call: Call) => unknown[] | undefined;

export function mockSupabase(users: Record<string, string>, rows: Rows = () => []) {
    const calls: Call[] = [];
    mock.method(globalThis, 'fetch', async (input: any, init: RequestInit = {}) => {
        const url = new URL(String(input));
        if (!url.origin.startsWith('http://localhost:54321')) return realFetch(input, init);
        const headers = new Headers(init.headers);
        if (url.pathname === '/auth/v1/user') {
            const id = users[(headers.get('authorization') ?? '').slice(7)];
            return id
                ? Response.json({ id, email: `${id}@test.dev`, aud: 'authenticated' })
                : Response.json({ msg: 'invalid' }, { status: 401 });
        }
        const table = url.pathname.replace('/rest/v1/', '');
        const call = { method: init.method ?? 'GET', table, url, body: init.body ? JSON.parse(String(init.body)) : undefined };
        calls.push(call);
        const data = rows(call) ?? [];
        if ((headers.get('accept') ?? '').includes('vnd.pgrst.object')) {
            return data.length
                ? Response.json(data[0])
                : Response.json({ code: 'PGRST116', message: 'no rows' }, { status: 406 });
        }
        return Response.json(data);
    });
    return calls;
}

export async function serve(path: string, router: Router) {
    const app = express();
    app.use(express.json());
    app.use(path, router);
    app.use(errorHandler);
    const server: Server = app.listen(0);
    await once(server, 'listening');
    return { server, base: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

export const auth = (token: string) => ({ authorization: `Bearer ${token}` });
