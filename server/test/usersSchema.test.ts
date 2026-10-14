import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SELF_PROFILE_FIELDS } from '../src/services/userProfile';
import snapshot from './prodUsersSchema.json';

const migrationsDir = join(__dirname, '..', 'src', 'db', 'migrations');
const srcDir = join(__dirname, '..', 'src');

function knownColumns() {
    const columns = new Set(snapshot.users_columns);
    for (const file of readdirSync(migrationsDir)) {
        const num = Number(file.match(/^(\d+)_/)?.[1]);
        if (!(num >= snapshot.pending_migrations_from)) continue;
        const sql = readFileSync(join(migrationsDir, file), 'utf8');
        for (const stmt of sql.matchAll(/ALTER TABLE (?:public\.)?users\b([^;]*)/gi)) {
            for (const m of stmt[1].matchAll(/ADD COLUMN(?: IF NOT EXISTS)?\s+(\w+)/gi)) columns.add(m[1]);
        }
    }
    return columns;
}

function referencedColumns() {
    const refs: [string, string][] = SELF_PROFILE_FIELDS.map((c) => ['SELF_PROFILE_FIELDS', c]);
    for (const file of readdirSync(srcDir, { recursive: true }).map(String).filter((f) => f.endsWith('.ts'))) {
        const text = readFileSync(join(srcDir, file), 'utf8');
        for (const m of text.matchAll(/from\('users'\)/g)) {
            const rest = text.slice(m.index + m[0].length);
            const ends = [rest.indexOf(';'), rest.indexOf('.from(')].filter((i) => i >= 0);
            const chain = rest.slice(0, Math.min(...ends, rest.length));
            for (const sel of chain.matchAll(/\.select\(\s*(['"`])(.*?)\1/gs)) {
                for (const col of sel[2].replace(/\$\{[^}]*\}/g, '').split(',')) {
                    if (col.trim()) refs.push([file, col.trim()]);
                }
            }
            for (const obj of chain.matchAll(/\.(?:insert|upsert|update)\(\s*\{([^}]*)\}/g)) {
                for (const key of obj[1].matchAll(/(\w+)\s*:/g)) refs.push([file, key[1]]);
            }
        }
    }
    return refs;
}

test('every users column the server selects or writes exists in production or a pending migration', () => {
    const known = knownColumns();
    const missing = referencedColumns().filter(([, col]) => !known.has(col)).map(([where, col]) => `${where}: ${col}`);
    assert.deepEqual([...new Set(missing)], []);
});

test('the column scan sees the selects it is meant to guard', () => {
    const cols = new Set(referencedColumns().map(([, c]) => c));
    for (const c of ['google_calendar_refresh', 'location_permission_status', 'last_seen_at', 'school_id']) assert.ok(cols.has(c), c);
});
