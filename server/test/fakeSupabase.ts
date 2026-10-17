import { mock } from 'node:test';
import { randomUUID } from 'node:crypto';
import { realFetch } from './supabaseMock';

type Row = Record<string, any>;

const ORIGIN = 'http://localhost:54321';
const iso = () => new Date().toISOString();

const KEYS: Record<string, string[]> = {
    users: ['id'],
    parties: ['id'],
    party_members: ['party_id', 'user_id'],
    locations: ['id'],
    votes: ['id'],
    proposal_responses: ['party_id', 'voting_round', 'proposal_rank', 'user_id'],
    party_dates: ['id'],
    date_votes: ['id'],
};

const UNIQUE: Record<string, string[][]> = {
    users: [['email']],
    parties: [['code']],
    locations: [['party_id', 'google_place_id']],
    votes: [['party_id', 'user_id', 'location_id']],
    party_dates: [['party_id', 'starts_at']],
    date_votes: [['party_date_id', 'user_id']],
};

const DEFAULTS: Record<string, (now: string) => Row> = {
    users: (now: string) => ({ avatar_color: '#6C3EF4', google_calendar_token: null, google_calendar_refresh: null, created_at: now }),
    parties: (now: string) => ({
        id: randomUUID(), name: null, status: 'waiting', is_public: false, matched_location_id: null, locked_date_id: null,
        midpoint_lat: null, midpoint_lng: null, current_card_index: null, voting_round: 1, proposal_location_id: null,
        proposal_rank: 0, rejected_location_ids: [], next_page_token: null, venue_rotation_seed: 0, gcal_event_id: null,
        created_at: now, updated_at: now,
    }),
    party_members: (now: string) => ({
        joined_at: now, is_online: false, live_latitude: null, live_longitude: null, live_at: null,
        custom_latitude: null, custom_longitude: null, custom_label: null, location_mode: 'live',
    }),
    locations: (now: string) => ({ id: randomUUID(), is_priority: false, rating: null, created_at: now }),
    votes: (now: string) => ({ id: randomUUID(), voted_at: now }),
    proposal_responses: (now: string) => ({ responded_at: now }),
    party_dates: (now: string) => ({ id: randomUUID(), proposed_by: null, created_at: now }),
    date_votes: (now: string) => ({ id: randomUUID(), available: true, voted_at: now }),
};

export type FakeDb = Record<string, Row[]>;

function views(db: FakeDb): Record<string, () => Row[]> {
    return {
        v_party_vote_tallies: () =>
            db.locations.map((l) => {
                const votes = db.votes.filter((v) => v.location_id === l.id);
                return {
                    party_id: l.party_id,
                    location_id: l.id,
                    location_name: l.name,
                    yes_votes: votes.filter((v) => v.vote === true).length,
                    no_votes: votes.filter((v) => v.vote === false).length,
                    total_members: db.party_members.filter((m) => m.party_id === l.party_id).length,
                };
            }),
    };
}

function splitTop(s: string): string[] {
    const out: string[] = [];
    let depth = 0;
    let cur = '';
    for (const ch of s) {
        if (ch === '(') depth++;
        if (ch === ')') depth--;
        if (ch === ',' && depth === 0) {
            out.push(cur.trim());
            cur = '';
        } else cur += ch;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
}

function unquote(v: string) {
    return v.startsWith('"') && v.endsWith('"') ? v.slice(1, -1) : v;
}

function compare(a: any, b: string): number {
    const na = Number(a);
    const nb = Number(b);
    if (typeof a === 'number' && Number.isFinite(nb)) return na - nb;
    return String(a) < b ? -1 : String(a) > b ? 1 : 0;
}

function matches(row: Row, col: string, expr: string): boolean {
    if (expr.startsWith('not.')) {
        const inner = expr.slice(4);
        if (row[col] == null && !inner.startsWith('is.')) return false;
        return !matches(row, col, inner);
    }
    const dot = expr.indexOf('.');
    const op = expr.slice(0, dot);
    const value = expr.slice(dot + 1);
    const cell = row[col];
    switch (op) {
        case 'eq': return cell !== null && cell !== undefined && String(cell) === value;
        case 'neq': return cell != null && String(cell) !== value;
        case 'gt': return cell != null && compare(cell, value) > 0;
        case 'gte': return cell != null && compare(cell, value) >= 0;
        case 'lt': return cell != null && compare(cell, value) < 0;
        case 'lte': return cell != null && compare(cell, value) <= 0;
        case 'is': return value === 'null' ? cell == null : String(cell) === value;
        case 'in': return splitTop(value.slice(1, -1)).map(unquote).includes(String(cell));
        default: throw new Error(`fakeSupabase: unsupported filter ${col}=${expr}`);
    }
}

const RESERVED = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns']);

function filterRows(rows: Row[], params: URLSearchParams): Row[] {
    let out = rows;
    for (const key of new Set(params.keys())) {
        if (RESERVED.has(key)) continue;
        if (key === 'or') throw new Error('fakeSupabase: or filters are not supported');
        for (const expr of params.getAll(key)) out = out.filter((r) => matches(r, key, expr));
    }
    return out;
}

function orderRows(rows: Row[], order: string | null): Row[] {
    if (!order) return rows;
    const terms = order.split(',').map((t) => {
        const [col, dir = 'asc', nulls] = t.split('.');
        return { col, desc: dir === 'desc', nullsFirst: nulls ? nulls === 'nullsfirst' : dir === 'desc' };
    });
    return [...rows].sort((a, b) => {
        for (const { col, desc, nullsFirst } of terms) {
            const x = a[col];
            const y = b[col];
            if (x == null && y == null) continue;
            if (x == null) return nullsFirst ? -1 : 1;
            if (y == null) return nullsFirst ? 1 : -1;
            const c = typeof x === 'number' && typeof y === 'number' ? x - y : typeof x === 'boolean' ? Number(x) - Number(y) : String(x).localeCompare(String(y));
            if (c !== 0) return desc ? -c : c;
        }
        return 0;
    });
}

function project(db: FakeDb, row: Row, select: string | null): Row {
    if (!select || select === '*') return { ...row };
    const out: Row = {};
    for (const part of splitTop(select)) {
        const embed = part.match(/^(\w+)\((.*)\)$/);
        if (embed) {
            const [, table, inner] = embed;
            const fk = `${table.replace(/s$/, '')}_id`;
            const target = (db[table] ?? []).find((r) => r.id === row[fk]);
            out[table] = target ? project(db, target, inner) : null;
        } else if (part === '*') Object.assign(out, row);
        else out[part] = row[part] ?? null;
    }
    return out;
}

function pgError(status: number, code: string, message: string) {
    return Response.json({ code, message, details: null, hint: null }, { status });
}

function sameKey(a: Row, b: Row, cols: string[]) {
    return cols.every((c) => String(a[c]) === String(b[c]));
}

export function createFakeSupabase(seed: Partial<FakeDb> = {}) {
    const db: FakeDb = Object.fromEntries(Object.keys(KEYS).map((t) => [t, [...(seed[t] ?? [])]]));
    const passwords = new Map<string, string>();
    const calls: { method: string; table: string; url: URL; body: any }[] = [];

    function rest(method: string, url: URL, headers: Headers, body: any): Response {
        const table = url.pathname.replace('/rest/v1/', '');
        calls.push({ method, table, url, body });
        const view = views(db)[table];
        if (!view && !db[table]) throw new Error(`fakeSupabase: unknown table ${table}`);
        const prefer = headers.get('prefer') ?? '';
        const wantObject = (headers.get('accept') ?? '').includes('vnd.pgrst.object');
        const representation = prefer.includes('return=representation');
        const select = url.searchParams.get('select');

        const respond = (rows: Row[], status: number, total?: number) => {
            const extra: Record<string, string> = {};
            if (prefer.includes('count=exact')) extra['content-range'] = rows.length ? `0-${rows.length - 1}/${total ?? rows.length}` : `*/${total ?? 0}`;
            if (method === 'HEAD') return new Response(null, { status: 200, headers: extra });
            if (!representation && method !== 'GET') return new Response(null, { status: status === 200 ? 204 : status, headers: extra });
            const shaped = rows.map((r) => project(db, r, select));
            if (wantObject) {
                if (shaped.length !== 1) return pgError(406, 'PGRST116', `JSON object requested, multiple (or no) rows returned (${shaped.length})`);
                return Response.json(shaped[0], { status, headers: extra });
            }
            return Response.json(shaped, { status, headers: extra });
        };

        if (method === 'GET' || method === 'HEAD') {
            const source = view ? view() : db[table];
            const filtered = orderRows(filterRows(source, url.searchParams), url.searchParams.get('order'));
            const offset = Number(url.searchParams.get('offset') ?? 0);
            const limit = url.searchParams.get('limit');
            const page = filtered.slice(offset, limit ? offset + Number(limit) : undefined);
            return respond(page, 200, filtered.length);
        }

        const rows = db[table];
        if (method === 'POST') {
            const incoming: Row[] = Array.isArray(body) ? body : [body];
            const upsert = prefer.includes('resolution=');
            const ignore = prefer.includes('resolution=ignore-duplicates');
            const conflict = url.searchParams.get('on_conflict')?.split(',') ?? KEYS[table];
            const written: Row[] = [];
            const stamp = iso();
            for (const raw of incoming) {
                const candidate = { ...DEFAULTS[table](stamp), ...raw };
                const existing = upsert ? rows.find((r) => sameKey(r, candidate, conflict)) : undefined;
                if (existing) {
                    if (!ignore) {
                        Object.assign(existing, raw);
                        written.push(existing);
                    }
                    continue;
                }
                for (const cols of [KEYS[table], ...(UNIQUE[table] ?? [])]) {
                    if (cols.every((c) => candidate[c] != null) && rows.some((r) => sameKey(r, candidate, cols))) {
                        return pgError(409, '23505', `duplicate key value violates unique constraint "${table}_${cols.join('_')}_key"`);
                    }
                }
                rows.push(candidate);
                written.push(candidate);
            }
            return respond(written, 201);
        }
        if (method === 'PATCH') {
            const hit = filterRows(rows, url.searchParams);
            for (const r of hit) Object.assign(r, body);
            return respond(hit, 200);
        }
        if (method === 'DELETE') {
            const hit = new Set(filterRows(rows, url.searchParams));
            db[table] = rows.filter((r) => !hit.has(r));
            return respond([...hit], 200);
        }
        throw new Error(`fakeSupabase: unsupported method ${method}`);
    }

    function authUser(token: string | null) {
        const id = token?.startsWith('tok-') ? token.slice(4) : null;
        return id ? db.users.find((u) => u.id === id) : undefined;
    }

    async function handle(input: any, init: RequestInit = {}): Promise<Response> {
        const url = new URL(String(input));
        if (url.origin !== ORIGIN) return realFetch(input, init);
        const headers = new Headers(init.headers);
        const method = (init.method ?? 'GET').toUpperCase();
        const body = init.body ? JSON.parse(String(init.body)) : undefined;
        if (url.pathname === '/auth/v1/user') {
            const user = authUser((headers.get('authorization') ?? '').slice(7));
            return user ? Response.json({ id: user.id, email: user.email, aud: 'authenticated' }) : Response.json({ msg: 'invalid JWT' }, { status: 401 });
        }
        if (url.pathname === '/auth/v1/token') {
            const user = db.users.find((u) => u.email === body?.email);
            if (!user || passwords.get(user.id) !== body?.password) {
                return Response.json({ error: 'invalid_grant', error_description: 'Invalid login credentials' }, { status: 400 });
            }
            return Response.json({
                access_token: `tok-${user.id}`,
                refresh_token: `refresh-${user.id}`,
                expires_in: 3600,
                expires_at: Math.floor(Date.now() / 1000) + 3600,
                token_type: 'bearer',
                user: { id: user.id, email: user.email, aud: 'authenticated' },
            });
        }
        if (url.pathname.startsWith('/auth/v1/logout')) return new Response(null, { status: 204 });
        if (url.pathname.startsWith('/storage/v1/')) return Response.json({ name: 'bucket' });
        if (url.pathname.startsWith('/rest/v1/')) return rest(method, url, headers, body);
        throw new Error(`fakeSupabase: unhandled ${method} ${url.pathname}`);
    }

    return {
        db,
        calls,
        install() {
            return mock.method(globalThis, 'fetch', handle);
        },
        addUser(id: string, extra: Row = {}) {
            const user = { ...DEFAULTS.users(iso()), id, email: `${id}@test.dev`, display_name: id[0].toUpperCase() + id.slice(1), ...extra };
            db.users.push(user);
            passwords.set(id, `pw-${id}`);
            return user;
        },
        setPassword(id: string, password: string) {
            passwords.set(id, password);
        },
    };
}

export type FakeSupabase = ReturnType<typeof createFakeSupabase>;
