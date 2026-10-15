import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { locationSourceLabel } from '../src/services/locationChoice.ts';

const read = (p) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');

test('party cards label the stored location the way the lobby does', () => {
    assert.equal(locationSourceLabel({ mode: 'live', custom_label: null, live_fresh: true }), 'Live');
    assert.equal(locationSourceLabel({ mode: 'custom', custom_label: 'Newark', live_fresh: true }), 'Custom: Newark');
    assert.equal(locationSourceLabel({ mode: 'live', custom_label: 'Newark', live_fresh: false }), 'Custom: Newark');
    assert.equal(locationSourceLabel({ mode: 'live', custom_label: null, live_fresh: false }), 'Not set yet');
    assert.equal(locationSourceLabel(undefined), 'Not set yet');
});

test('clearing the saved location refreshes the signed-in profile', () => {
    const profile = read('screens/ProfileScreen.tsx');
    const handler = profile.slice(profile.indexOf('const handleRevokeLocation'), profile.indexOf('const profileIncomplete'));
    assert.match(handler, /await api\.revokeLocation\(\);[\s\S]*refreshProfile\(\)/);
    assert.match(profile, /site settings/);
    assert.match(read('screens/LocationPermissionScreen.tsx'), /setLocationPermission\('granted'\);\s*\n\s*await refreshProfile\(\);/);
});

test('home party cards show my location source', () => {
    assert.match(read('screens/HomeScreen.tsx'), /locationSourceLabel\(/);
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

test('clear saved location says what it does not change', () => {
    const profile = read('screens/ProfileScreen.tsx');
    assert.doesNotMatch(profile, /next time you create or join/);
    assert.match(profile, /Doesn't change your browser's location permission or locations already set in your parties/);
    assert.match(profile, /Doesn't affect Discover, which uses your live location or a city you choose there\./);
});

test('Discover says whether it is using live location or a chosen city', () => {
    const discover = read('screens/DiscoverScreen.tsx');
    assert.match(discover, /pickedLabel \? 'Using: Chosen city' : 'Using: Live location'/);
    for (const file of ['screens/DiscoverScreen.tsx', 'components/LocationSourceCard.tsx']) {
        assert.match(read(file), /denied: 'Location is blocked for LinkdUp\. Allow it in your browser or phone settings, /, file);
    }
});
