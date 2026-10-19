import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const seed = readFileSync(join(__dirname, '..', 'src', 'db', 'seed', 'demo_seed.sql'), 'utf8');
const FRIENDS = ['maya', 'theo', 'priya', 'jordan', 'sam'];

function followStatement() {
    const m = seed.match(/insert into public\.user_follows[^;]*;/i);
    assert.ok(m, 'expected a user_follows insert');
    return m[0];
}

test('every demo friend and the demo user follow each other, so all five are friends', () => {
    const pairs = new Set([...followStatement().matchAll(/\('(\w+)',\s*'(\w+)'\)/g)].map((m) => `${m[1]}->${m[2]}`));
    for (const f of FRIENDS) {
        assert.ok(pairs.has(`me->${f}`), `me->${f}`);
        assert.ok(pairs.has(`${f}->me`), `${f}->me`);
    }
});

test('the demo follows are safe to run again', () => {
    assert.match(followStatement(), /on conflict[^;]*do nothing/i);
});

test('the seed no longer writes the old friendships table', () => {
    assert.doesNotMatch(seed, /insert into public\.friendships/i);
});
