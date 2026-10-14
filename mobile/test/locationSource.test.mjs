import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { locationSourceLabel } from '../src/services/locationChoice.ts';

const read = (p) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');

test('party cards label the stored location the way the lobby does', () => {
    assert.equal(locationSourceLabel({ mode: 'live', custom_label: null, live_fresh: true }), 'Live');
    assert.equal(locationSourceLabel({ mode: 'custom', custom_label: 'Newark', live_fresh: true }), 'Custom: Newark');
    assert.equal(locationSourceLabel({ mode: 'live', custom_label: 'Newark', live_fresh: false }), 'Custom: Newark');
    assert.equal(locationSourceLabel({ mode: 'live', custom_label: null, live_fresh: false }), 'Not set');
    assert.equal(locationSourceLabel(undefined), 'Not set');
});

test('clearing the saved location refreshes the signed-in profile so create and join ask again', () => {
    const profile = read('screens/ProfileScreen.tsx');
    const handler = profile.slice(profile.indexOf('const handleRevokeLocation'), profile.indexOf('const profileIncomplete'));
    assert.match(handler, /await api\.revokeLocation\(\);[\s\S]*refreshProfile\(\)/);
    assert.match(profile, /site settings/);
    assert.match(read('screens/LocationPermissionScreen.tsx'), /setLocationPermission\('granted'\);\s*\n\s*await refreshProfile\(\);/);
    assert.match(read('screens/JoinPartyScreen.tsx'), /checkLocation\(/);
    assert.match(read('screens/CreatePartyScreen.tsx'), /checkLocation\(/);
});

test('home party cards show my location source', () => {
    assert.match(read('screens/HomeScreen.tsx'), /locationSourceLabel\(/);
});
