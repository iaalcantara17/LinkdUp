import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = join(__dirname, '..', 'src', 'db', 'migrations');
const file = join(dir, '038_rename_friendships_to_legacy.sql');
const flat = () => readFileSync(file, 'utf8').replace(/\s+/g, ' ').toLowerCase();
const statements = () => flat().replace(/\$\$.*?\$\$/g, (block) => block.replace(/;/g, ',')).split(';').map((s) => s.trim()).filter(Boolean);

test('the rename is the next numbered migration after the follows backfill', () => {
    assert.ok(existsSync(file), file);
    const numbered = readdirSync(dir).filter((f) => /^\d{3}_/.test(f)).sort();
    assert.equal(numbered.at(-1), '038_rename_friendships_to_legacy.sql');
});

test('the rename runs inside one transaction', () => {
    const s = statements();
    assert.equal(s[0], 'begin');
    assert.ok(s.indexOf('commit') > s.findIndex((x) => x.includes('rename to friendships_legacy')));
});

test('it keeps the table and its rows, never dropping or deleting anything', () => {
    for (const word of ['drop ', 'delete ', 'truncate', 'update ', 'insert ']) assert.ok(!flat().includes(word), word);
});

test('the rename only happens once, so running it again is safe', () => {
    assert.match(flat(), /if to_regclass\('public\.friendships'\) is not null and to_regclass\('public\.friendships_legacy'\) is null then alter table public\.friendships rename to friendships_legacy;/);
});

test('the kept table has row level security on', () => {
    assert.match(flat(), /alter table public\.friendships_legacy enable row level security/);
});

test('it ends with checks on the rename, row level security, policies and rows kept', () => {
    const last = statements().at(-1)!;
    for (const col of ['legacy_table_exists', 'old_name_gone', 'rls_enabled', 'policies', 'rows_kept']) {
        assert.match(last, new RegExp(`as ${col}\\b`), col);
    }
});
