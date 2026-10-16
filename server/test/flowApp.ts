import './env';
import { mock } from 'node:test';
import { once } from 'node:events';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import axios from 'axios';
import { google } from 'googleapis';
import { realFetch } from './supabaseMock';
import { createFakeSupabase, type FakeSupabase } from './fakeSupabase';

export type Sent = { method: string; path: string; status: number; text: string };

export async function bootApp(): Promise<{ server: Server; base: string }> {
    let app: express.Express | undefined;
    const listen = mock.method(express.application, 'listen', function (this: express.Express) {
        app = this;
        return undefined as any;
    });
    const boot = createFakeSupabase();
    const fetchMock = boot.install();
    await import('../src/index');
    listen.mock.restore();
    fetchMock.mock.restore();
    if (!app) throw new Error('src/index.ts did not call app.listen');
    const server = createServer(app).listen(0);
    await once(server, 'listening');
    return { server, base: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

export function venue(i: number) {
    return {
        id: `ChIJvenue${i}`,
        displayName: { text: `Venue ${i}` },
        formattedAddress: `${i} Main St, Hoboken, NJ`,
        location: { latitude: 40.74 + i / 1000, longitude: -74.03 },
        rating: 4.0 + (i % 5) / 10,
        userRatingCount: 100 + i,
        priceLevel: 'PRICE_LEVEL_MODERATE',
        primaryType: 'cafe',
        types: ['cafe'],
    };
}

export function mockGoogle({ venues = 3 }: { venues?: number } = {}) {
    let offset = 0;
    const places = mock.method(axios, 'post', async (url: string) => {
        if (!String(url).includes('places.googleapis.com')) throw new Error(`unexpected axios.post ${url}`);
        const batch = Array.from({ length: venues }, (_, i) => venue(offset + i + 1));
        offset += venues;
        return { data: { places: batch } };
    });
    const inserts: any[] = [];
    const fakeCalendar = () => ({
        events: {
            insert: async (args: any) => {
                inserts.push(args);
                return { data: { id: `evt-${inserts.length}`, htmlLink: `https://calendar.google.com/event?eid=${inserts.length}` } };
            },
            delete: async () => ({ data: {} }),
        },
    });
    const calendar = mock.method(google, 'calendar', fakeCalendar as any);
    return { places, calendar, inserts };
}

export function client(base: string, sent: Sent[] = []) {
    async function call(method: string, path: string, token?: string, body?: unknown) {
        const res = await realFetch(`${base}${path}`, {
            method,
            headers: {
                ...(token ? { authorization: `Bearer ${token}` } : {}),
                ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
            },
            body: body !== undefined ? JSON.stringify(body) : undefined,
        });
        const text = await res.text();
        sent.push({ method, path, status: res.status, text });
        let json: any = null;
        try { json = text ? JSON.parse(text) : null; } catch { json = null; }
        return { status: res.status, json, text, headers: res.headers };
    }
    return { call, sent };
}

export function freshWorld() {
    const fake: FakeSupabase = createFakeSupabase();
    for (const id of ['alice', 'bob', 'carol', 'dave', 'mallory']) fake.addUser(id);
    fake.install();
    return fake;
}

export const tok = (id: string) => `tok-${id}`;
