import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { control, motion, duration, stagger, press } from '../src/theme/tokens.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const screens = ['Home', 'CreateParty', 'JoinParty', 'PartyLobby', 'Swipe', 'Match', 'Proposal', 'DateTimeSetup', 'CalendarConfirmation', 'Friends', 'Discover', 'Profile'].map((s) => `src/screens/${s}Screen.tsx`);
const kit = ['src/components/kit.tsx', 'src/components/GradientButton.tsx'];
const read = (f) => readFileSync(root + f, 'utf8');

test('control heights sit on the 4 point grid and meet the 44 point touch target', () => {
    for (const [size, h] of Object.entries(control)) {
        assert.equal(h % 4, 0, size);
        assert.ok(h >= 44, size);
    }
});

test('motion durations used by the kit stay between 100 and 300 ms', () => {
    for (const name of ['instant', 'fast', 'base']) {
        const ms = duration(name, false);
        assert.ok(ms >= 100 && ms <= 300, `${name} ${ms}`);
        assert.equal(ms, motion[name]);
    }
});

test('reduced motion turns every kit duration and stagger to zero', () => {
    for (const name of ['instant', 'fast', 'base']) assert.equal(duration(name, true), 0);
    assert.equal(stagger(3, true), 0);
});

test('list stagger is short and capped so long lists never wait', () => {
    assert.equal(stagger(0, false), 0);
    assert.ok(stagger(1, false) > 0);
    assert.equal(stagger(50, false), stagger(6, false));
    assert.ok(stagger(50, false) + duration('base', false) <= 600);
});

test('press feedback is a slight scale and opacity that never blocks input', () => {
    assert.ok(press.scale >= 0.95 && press.scale < 1);
    assert.ok(press.opacity >= 0.7 && press.opacity < 1);
    assert.ok(press.ms >= 100 && press.ms <= 300);
});

function offGrid(files) {
    return files.flatMap((f) =>
        read(f).split('\n').flatMap((line, i) =>
            [...line.matchAll(/\b(padding\w*|margin\w*|gap|rowGap|columnGap):\s*(\d+)\b/g)]
                .filter((m) => Number(m[2]) % 4 !== 0)
                .map((m) => `${f}:${i + 1} ${m[0]}`)
        )
    );
}

test('party flow, Friends, Discover and Profile spacing sits on the 4 point grid', () => {
    const found = offGrid([...screens, ...kit]);
    assert.deepEqual(found, [], found.join('\n'));
});

test('the kit takes every animation duration from the motion tokens', () => {
    const found = read('src/components/kit.tsx').split('\n').filter((l) => /duration\(\s*\d|duration:\s*\d|delay\(\s*\d/.test(l));
    assert.deepEqual(found, []);
});

test('party flow, Friends, Discover and Profile use the kit Tap instead of bare touchables', () => {
    const found = screens.filter((f) => /\bTouchableOpacity\b|\bTouchableHighlight\b/.test(read(f)));
    assert.deepEqual(found, []);
});
