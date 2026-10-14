import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { startGate, pendingAction } from '../src/services/locationChoice.ts';

const read = (p) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');
const at = (lat) => ({ display_lat: lat, display_lng: lat === null ? null : -74 });

test('start is enabled once any member has a location', () => {
    assert.equal(startGate([at(null), at(40.7), at(null)]).canStart, true);
    assert.equal(startGate([at(40.7)]).canStart, true);
});

test('start is disabled with a reason when nobody has a location', () => {
    const solo = startGate([at(null)]);
    assert.equal(solo.canStart, false);
    assert.match(solo.reason, /Add yours above/);
    const crew = startGate([at(null), at(null)]);
    assert.equal(crew.canStart, false);
    assert.match(crew.reason, /someone in your crew/);
    assert.equal(startGate([]).canStart, false);
});

test('an action waiting on permission runs once, and only if permission was granted', () => {
    const p = pendingAction();
    let runs = 0;
    p.arm(() => { runs++; });
    p.resume(true);
    p.resume(true);
    assert.equal(runs, 1);
    p.arm(() => { runs++; });
    p.resume(false);
    p.resume(true);
    assert.equal(runs, 1);
    p.resume(true);
    assert.equal(runs, 1);
});

test('create and join never ask for or require location', () => {
    for (const f of ['screens/CreatePartyScreen.tsx', 'screens/JoinPartyScreen.tsx', 'screens/DiscoverScreen.tsx', 'screens/PartyLobbyScreen.tsx']) {
        assert.doesNotMatch(read(f), /useLocationGuard|checkLocation/, f);
    }
    assert.equal(existsSync(new URL('../src/hooks/useLocationGuard.tsx', import.meta.url)), false);
});

test('nothing asks for location on page load or refresh', () => {
    assert.doesNotMatch(read('navigation/RootNavigator.tsx'), /startScreen = 'LocationPermission'/);
    assert.doesNotMatch(read('screens/HomeScreen.tsx'), /replace\('LocationPermission'\)/);
    assert.doesNotMatch(read('navigation/MainStack.tsx'), /LocationBanner/);
});

test('the lobby card resumes live location after the explainer and gates start', () => {
    const card = read('components/LocationSourceCard.tsx');
    assert.match(card, /navigate\('LocationPermission'\)/);
    assert.match(card, /pendingAction\(\)/);
    assert.match(card, /\.resume\(/);
    const lobby = read('screens/PartyLobbyScreen.tsx');
    assert.match(lobby, /startGate\(members\)/);
    assert.match(lobby, /disabled=\{!gate\.canStart\}/);
});

test('a failed member fetch never disables start or flips a group to solo', () => {
    assert.match(read('screens/PartyLobbyScreen.tsx'), /getMembers\(partyId\)\.catch\(\(\) => null\)/);
    assert.match(read('screens/SwipeScreen.tsx'), /getMembers\(partyId\)\.catch\(\(\) => null\)/);
});

test('the live button only opens the explainer when the browser has not been asked yet', () => {
    const card = read('components/LocationSourceCard.tsx');
    assert.match(card, /if \(liveIssue === 'prompt'\)/);
    assert.match(card, /afterAllow\.resume\(true\)/);
    assert.doesNotMatch(card, /useAuth/);
});
