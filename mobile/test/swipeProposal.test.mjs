import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/screens/SwipeScreen.tsx', import.meta.url), 'utf8');

test('solo parties follow the server into the proposal when a round ends', () => {
    assert.doesNotMatch(src, /memberCount > 1/);
    assert.doesNotMatch(src, /if \(!isSolo\)/);
    assert.match(src, /r\?\.proposing/);
});

test('force match recovers when the round already ended', () => {
    assert.match(src, /party_not_swiping/);
});

test('the proposal replaces the swipe screen once so rounds do not stack swipe screens', () => {
    assert.doesNotMatch(src, /navigate\('Proposal'/);
    assert.match(src, /replace\('Proposal'/);
    assert.match(src, /handedOff\.current/);
});
