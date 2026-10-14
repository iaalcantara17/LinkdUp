import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { latestOnly } from '../src/hooks/latestOnly.ts';

function deferred() {
    let resolve;
    const promise = new Promise((r) => { resolve = r; });
    return { promise, resolve };
}

test('a load that finishes after a newer one is ignored', async () => {
    const latest = latestOnly();
    const applied = [];
    const run = async (d, label) => {
        const isLatest = latest();
        await d.promise;
        if (isLatest()) applied.push(label);
    };
    const old = deferred();
    const fresh = deferred();
    const a = run(old, 'stale list with the deleted party');
    const b = run(fresh, 'list after delete');
    fresh.resolve();
    await b;
    old.resolve();
    await a;
    assert.deepEqual(applied, ['list after delete']);
});

test('a single load still applies', async () => {
    const latest = latestOnly();
    const isLatest = latest();
    await null;
    assert.equal(isLatest(), true);
});

for (const file of ['HomeScreen.tsx', 'HangoutsScreen.tsx']) {
    test(`${file} drops stale loads and refetches after leave and delete`, () => {
        const src = readFileSync(new URL(`../src/screens/${file}`, import.meta.url), 'utf8');
        assert.match(src, /latestOnly\(\)/);
        assert.match(src, /if \(!isLatest\(\)\) return;/);
        const after = (fn) => src.slice(src.indexOf(`const ${fn} = async`)).split('\n    };')[0];
        for (const fn of ['confirmDelete', 'confirmLeave']) {
            assert.match(after(fn), /\.filter\([^)]*\)\);\s*\n\s*load\(\);/, `${fn} should refetch after the mutation`);
        }
    });
}
