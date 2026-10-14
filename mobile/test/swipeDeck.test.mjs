import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deckProgress, turnLabel } from '../src/services/swipeDeck.ts';

const src = readFileSync(new URL('../src/screens/SwipeScreen.tsx', import.meta.url), 'utf8');

test('the counter shows the real number of cards', () => {
    assert.deepEqual(deckProgress(8, 9), { label: 'Card 9 of 9', percent: 1 });
    assert.deepEqual(deckProgress(0, 10), { label: 'Card 1 of 10', percent: 0.1 });
    assert.equal(deckProgress(12, 15).label, 'Card 13 of 15');
    assert.equal(deckProgress(0, 0).label, 'Card 1 of 1');
});

test('a solo voter is never told to wait for everyone', () => {
    const solo = turnLabel({ solo: true, locked: true, flash: false, waitingNames: [] });
    assert.doesNotMatch(solo, /wait/i);
    assert.equal(turnLabel({ solo: false, locked: true, flash: false, waitingNames: ['Sam'] }), 'Voted ✓ - waiting for Sam…');
    assert.equal(turnLabel({ solo: false, locked: false, flash: false, waitingNames: [] }), 'Your turn - swipe or tap to vote');
    assert.equal(turnLabel({ solo: false, locked: true, flash: true, waitingNames: [] }), 'Everyone voted - next card!');
});

test('swipe screen uses the real deck size, never shows a swiped-off card, and refetches cards for a new round', () => {
    assert.match(src, /deckProgress\(index, venues\.length\)/);
    assert.doesNotMatch(src, /roundSizeTarget/);
    assert.match(src, /!isDemo && buttonsLocked && !isSolo/);
    assert.match(src, /useEffect\(\(\) => \{\s*translateX\.value = 0;\s*translateY\.value = 0;\s*\}, \[index/);
    assert.match(src, /serverIndex >= venues\.length\) load\(\)/);
});
