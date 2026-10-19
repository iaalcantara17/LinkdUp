import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const file = join(__dirname, '..', 'src', 'db', 'migrations', '037_follows_from_friendships.sql');
const sql = () => readFileSync(file, 'utf8');
const flat = () => sql().replace(/\s+/g, ' ').toLowerCase();
const statements = () => flat().split(';').map((s) => s.trim()).filter(Boolean);

test('the backfill migration is the next numbered migration', () => {
    assert.ok(existsSync(file), file);
});

test('the backfill runs inside one transaction', () => {
    const s = statements();
    assert.equal(s[0], 'begin');
    assert.ok(s.includes('commit'));
    assert.ok(s.indexOf('commit') > s.findIndex((x) => x.includes('insert into public.user_follows')));
});

test('the backfill is additive only and never drops, renames, deletes or rewrites anything', () => {
    for (const word of ['drop ', 'rename', 'delete ', 'truncate', 'update ']) {
        assert.ok(!flat().includes(word), word);
    }
});

test('every insert skips rows that already exist so running it twice is safe', () => {
    const inserts = statements().filter((s) => s.includes('insert into'));
    assert.ok(inserts.length > 0);
    for (const s of inserts) assert.match(s, /on conflict[^;]*do nothing/, s);
});

function branches() {
    const body = flat().match(/with wanted as \((.*?)\), allowed as/)![1];
    return body.split('union all').map((b) => {
        const m = b.match(/select (\w+)(?: as follower_id)?, (\w+).*from public\.friendships where status = '(\w+)'/)!;
        return `${m[3]}: ${m[1]} follows ${m[2]}`;
    }).sort();
}

test('accepted friendships become follows in both directions and pending ones only from requester to addressee', () => {
    assert.deepEqual(branches(), [
        'accepted: addressee_id follows requester_id',
        'accepted: requester_id follows addressee_id',
        'pending: requester_id follows addressee_id',
    ]);
});

test('no follow is created between two people when either has blocked the other', () => {
    assert.match(flat(), /not exists \(select 1 from public\.user_blocks/);
});

test('it records which follows it added so a rollback removes only those', () => {
    assert.match(flat(), /insert into public\.follow_backfill_037/);
    assert.match(flat(), /alter table public\.follow_backfill_037 enable row level security/);
});

test('it ends with checks comparing accepted friendships to mutual follow pairs', () => {
    const last = statements().at(-1)!;
    for (const col of ['accepted_pairs', 'pending_requests', 'mutual_follow_pairs', 'friendships_missing_a_follow', 'skipped_for_block', 'follows_added']) {
        assert.match(last, new RegExp(`as ${col}\\b`), col);
    }
});
