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

test('the client deck uses the same round-first order as the server', async () => {
    const { sortDeck } = await import('../src/services/swipeDeck.ts');
    const round1 = { created_at: '2026-10-14T10:00:00Z' };
    const round2 = { created_at: '2026-10-14T11:00:00Z' };
    const deck = sortDeck([
        { id: 'c', rating: 4.9, ...round2 },
        { id: 'a', rating: 4.0, ...round1 },
        { id: 'b', rating: 4.5, ...round1 },
        { id: 'p', rating: 3.0, is_priority: true, ...round1 },
    ]);
    assert.deepEqual(deck.map((v) => v.id), ['p', 'b', 'a', 'c']);
});

test('a drag past a quarter of the card width decides the vote', async () => {
    const { swipeDecision } = await import('../src/services/swipeDeck.ts');
    assert.equal(swipeDecision(101, 400), 'like');
    assert.equal(swipeDecision(-101, 400), 'nope');
    assert.equal(swipeDecision(100, 400), null);
    assert.equal(swipeDecision(-100, 400), null);
    assert.equal(swipeDecision(0, 400), null);
});

test('the LIKE and NOPE stamps fade in with drag distance and cap at the threshold', async () => {
    const { stampOpacity } = await import('../src/services/swipeDeck.ts');
    assert.deepEqual(stampOpacity(0, 400), { like: 0, nope: 0 });
    assert.deepEqual(stampOpacity(50, 400), { like: 0.5, nope: 0 });
    assert.deepEqual(stampOpacity(300, 400), { like: 1, nope: 0 });
    assert.deepEqual(stampOpacity(-50, 400), { like: 0, nope: 0.5 });
    assert.deepEqual(stampOpacity(-900, 400), { like: 0, nope: 1 });
});

test('the card tilts slightly with the drag', async () => {
    const { cardTilt } = await import('../src/services/swipeDeck.ts');
    assert.equal(cardTilt(0, 400), 0);
    assert.equal(cardTilt(200, 400), 5);
    assert.equal(cardTilt(400, 400), 10);
    assert.equal(cardTilt(-2000, 400), -10);
});

test('swipe motion is timed within 100 to 300 ms and drag is off when reduced motion is set', () => {
    assert.doesNotMatch(src, /withSpring/);
    assert.match(src, /const reduced = useReducedMotion\(\)/);
    assert.match(src, /Gesture\.Pan\(\)\s*\.enabled\(!reduced\)/);
    assert.match(src, /swipeDecision\(e\.translationX, width\)/);
    const swipeOff = src.slice(src.indexOf('const swipeOff'), src.indexOf('const buttonsLocked'));
    assert.match(swipeOff, /if \(reduced\) \{\s*advance\(liked\);/);
    for (const m of src.matchAll(/duration: (\w+(\.\w+)?)/g)) assert.match(m[1], /^motion\.(instant|fast|base)$/, `duration ${m[1]}`);
});

test('a failed vote brings the card back and a solo vote resyncs without realtime', () => {
    const advance = src.slice(src.indexOf('const advance = async'), src.indexOf('const swipeOff'));
    assert.match(advance, /catch \(err: any\) \{[\s\S]*translateX\.value = withTiming\(0, \{ duration: motion\.fast \}\)/);
    assert.match(advance, /if \(crewRef\.current\.length === 1\) load\(\)/);
    assert.doesNotMatch(src, /votingRoundRef/);
    assert.doesNotMatch(src, /setCrew\(\[\{ user_id: 'you'/);
});
