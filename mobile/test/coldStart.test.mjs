import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { trackRequest, isSlow, subscribeSlow, COLD_START_MS } from '../src/services/coldStart.ts';

function deferred() {
    let resolve, reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
}

test('the cold start wait is 3 seconds', () => {
    assert.equal(COLD_START_MS, 3_000);
});

test('a request is not slow before 3 seconds, is slow at 3 seconds, and clears when it finishes', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const d = deferred();
    const done = trackRequest(d.promise);
    t.mock.timers.tick(2_999);
    assert.equal(isSlow(), false);
    t.mock.timers.tick(1);
    assert.equal(isSlow(), true);
    d.resolve('ok');
    assert.equal(await done, 'ok');
    assert.equal(isSlow(), false);
});

test('a failed request also clears the note and keeps its error', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const d = deferred();
    const done = trackRequest(d.promise);
    t.mock.timers.tick(3_000);
    assert.equal(isSlow(), true);
    d.reject(new Error('Failed to fetch'));
    await assert.rejects(done, /Failed to fetch/);
    assert.equal(isSlow(), false);
});

test('a fast request never shows the note', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    await trackRequest(Promise.resolve(1));
    t.mock.timers.tick(10_000);
    assert.equal(isSlow(), false);
});

test('the note stays until every slow request finishes', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const a = deferred();
    const b = deferred();
    const da = trackRequest(a.promise);
    const db = trackRequest(b.promise);
    t.mock.timers.tick(3_000);
    a.resolve();
    await da;
    assert.equal(isSlow(), true);
    b.resolve();
    await db;
    assert.equal(isSlow(), false);
});

test('back to back quick requests do not add up to a slow one', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const a = deferred();
    const da = trackRequest(a.promise);
    t.mock.timers.tick(2_000);
    const b = deferred();
    const db = trackRequest(b.promise);
    a.resolve();
    await da;
    t.mock.timers.tick(1_500);
    assert.equal(isSlow(), false);
    b.resolve();
    await db;
});

test('listeners hear the note appear and clear', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const seen = [];
    const off = subscribeSlow(() => seen.push(isSlow()));
    const d = deferred();
    const done = trackRequest(d.promise);
    t.mock.timers.tick(3_000);
    d.resolve();
    await done;
    off();
    assert.deepEqual(seen, [true, false]);
});

test('every API request goes through the cold start tracker', () => {
    const src = readFileSync(new URL('../src/services/api.ts', import.meta.url), 'utf8');
    assert.match(src, /import \{ trackRequest \} from '\.\/coldStart';/);
    assert.match(src, /const res = await trackRequest\(fetch\(/);
});
