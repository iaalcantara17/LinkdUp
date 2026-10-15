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
        'screens/FriendsScreen.tsx': /listView\(friends, loadingFriends\)[\s\S]*listView\(pending, loadingPending\)/,
        'screens/DiscoverScreen.tsx': /listView\(visibleVenues, loadingVenues\)[\s\S]*listView\(parties, loadingParties\)/,
        'screens/HangoutsScreen.tsx': /listView\(hangouts, !loaded\)/,
        'screens/BlockedUsersScreen.tsx': /listView\(items, loading\)/,
    };
    for (const [file, pattern] of Object.entries(files)) assert.match(read(file), pattern, file);
    assert.match(read('screens/FriendsScreen.tsx'), /useState\(true\)[\s\S]*useState\(true\)/);
    assert.match(read('screens/BlockedUsersScreen.tsx'), /const \[loading, setLoading\] = useState\(true\)/);
    assert.match(read('screens/DiscoverScreen.tsx'), /useState\(_venueCache === null\)/);
});
