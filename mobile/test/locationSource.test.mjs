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

test('the location guard asks but never locks people out, and resumes after they allow', () => {
    const guard = read('hooks/useLocationGuard.tsx');
    assert.match(guard, /Not now/);
    assert.match(guard, /location_permission_status === 'granted' && pendingCallback\.current/);
    const enable = guard.slice(guard.indexOf('const handleEnable'), guard.indexOf('const handleSkip'));
    assert.doesNotMatch(enable, /pendingCallback\.current = null/);
});

test('a failed profile refresh keeps the signed-in profile', () => {
    const auth = read('context/AuthContext.tsx');
    const refresh = auth.slice(auth.indexOf('const refreshProfile'), auth.indexOf('}, [', auth.indexOf('const refreshProfile')));
    assert.doesNotMatch(refresh, /setUserProfile\(null\)/);
    assert.doesNotMatch(refresh, /fetchProfile\(\)/);
});

test('denying permission returns to the screen that asked', () => {
    assert.doesNotMatch(read('screens/LocationPermissionScreen.tsx'), /^\s*nav\.replace\('Home'\);\s*\n\s*return;/m);
});

test('profile never says a location was cleared when none was saved', () => {
    assert.doesNotMatch(read('screens/ProfileScreen.tsx'), /'Cleared'/);
});

test('home cards and the lobby share one source label', () => {
    assert.match(read('components/LocationSourceCard.tsx'), /choiceLabel\(/);
    assert.match(read('services/locationChoice.ts'), /export function locationSourceLabel[\s\S]*chooseLocation\(/);
});
