import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { listView } from '../src/hooks/listView.ts';

const read = (p) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');

test('before the first load finishes the list shows loading, never the empty state', () => {
    assert.equal(listView([], true), 'loading');
});

test('a refetch keeps a loaded list on screen instead of swapping it for a spinner', () => {
    assert.equal(listView([{ id: 'a' }], true), 'list');
    assert.equal(listView([{ id: 'a' }], false), 'list');
});

test('a finished load with nothing in it shows the empty state', () => {
    assert.equal(listView([], false), 'empty');
});

test('list screens start in loading and render through listView', () => {
    const files = {
        'screens/HomeScreen.tsx': /listView\(activeParties, !partiesLoaded\)/,
        'screens/FriendsScreen.tsx': /listView\(friends, loadingFriends\)[\s\S]*listView\(followBack, loadingFollowBack\)/,
        'screens/DiscoverScreen.tsx': /listView\(visibleVenues, loadingVenues\)[\s\S]*listView\(parties, loadingParties\)/,
        'screens/HangoutsScreen.tsx': /listView\(hangouts, !loaded\)/,
        'screens/BlockedUsersScreen.tsx': /listView\(items, loading\)/,
    };
    for (const [file, pattern] of Object.entries(files)) assert.match(read(file), pattern, file);
    assert.match(read('screens/FriendsScreen.tsx'), /useState\(true\)[\s\S]*useState\(true\)/);
    assert.match(read('screens/BlockedUsersScreen.tsx'), /const \[loading, setLoading\] = useState\(true\)/);
    const discover = read('screens/DiscoverScreen.tsx');
    assert.match(discover, /const \[loadingVenues, setLoadingVenues\] = useState\(true\)/);
    assert.match(discover, /const \[loadingParties, setLoadingParties\] = useState\(true\)/);
    assert.doesNotMatch(discover, /useState<\w+\[\]>\(_\w+Cache/);
    assert.match(read('screens/HomeScreen.tsx'), /=== 'loading' \?[\s\S]{0,80}<SkeletonList/);
    assert.match(read('screens/HangoutsScreen.tsx'), /=== 'loading' \?[\s\S]{0,80}<ActivityIndicator/);
});

test('moving Discover to a new place drops the old place lists before fetching', () => {
    assert.match(read('screens/DiscoverScreen.tsx'), /if \(isCacheStale\(lat, lng\)\) \{\s*setVenues\(\[\]\);\s*setParties\(\[\]\);/);
});
