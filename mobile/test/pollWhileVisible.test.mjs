import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pollWhileVisible, LOBBY_POLL_MS } from '../src/hooks/pollWhileVisible.ts';

function fakeDoc(state = 'visible') {
    const doc = new EventTarget();
    doc.visibilityState = state;
    doc.set = (s) => { doc.visibilityState = s; doc.dispatchEvent(new Event('visibilitychange')); };
    return doc;
}

test('lobby polls every 15 seconds', () => {
    assert.equal(LOBBY_POLL_MS, 15_000);
});

test('polls on the interval while visible, pauses while hidden, refreshes on return', () => {
    mock.timers.enable({ apis: ['setInterval'] });
    try {
        const doc = fakeDoc();
        let calls = 0;
        const stop = pollWhileVisible(() => calls++, 15_000, doc);
        mock.timers.tick(30_000);
        assert.equal(calls, 2);
        doc.set('hidden');
        mock.timers.tick(60_000);
        assert.equal(calls, 2);
        doc.set('visible');
        assert.equal(calls, 3);
        mock.timers.tick(15_000);
        assert.equal(calls, 4);
        stop();
        mock.timers.tick(60_000);
        doc.set('hidden');
        doc.set('visible');
        assert.equal(calls, 4);
    } finally {
        mock.timers.reset();
    }
});

test('starting while hidden does not poll until visible', () => {
    mock.timers.enable({ apis: ['setInterval'] });
    try {
        const doc = fakeDoc('hidden');
        let calls = 0;
        const stop = pollWhileVisible(() => calls++, 15_000, doc);
        mock.timers.tick(60_000);
        assert.equal(calls, 0);
        stop();
    } finally {
        mock.timers.reset();
    }
});

test('works without a document (native)', () => {
    mock.timers.enable({ apis: ['setInterval'] });
    try {
        let calls = 0;
        const stop = pollWhileVisible(() => calls++, 15_000, undefined);
        mock.timers.tick(15_000);
        assert.equal(calls, 1);
        stop();
    } finally {
        mock.timers.reset();
    }
});

test('lobby uses the helper and keeps friends out of the poll loop', () => {
    const src = readFileSync(new URL('../src/screens/PartyLobbyScreen.tsx', import.meta.url), 'utf8');
    assert.match(src, /pollWhileVisible\(refresh, LOBBY_POLL_MS\)/);
    assert.doesNotMatch(src, /setInterval\(/);
    const refreshBody = src.slice(src.indexOf('const refresh = useCallback'), src.indexOf('useFocusEffect('));
    assert.doesNotMatch(refreshBody, /getFriends/);
});
