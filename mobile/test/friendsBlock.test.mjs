import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');

test('friend rows offer Block through the shared confirm', () => {
    const src = read('screens/FriendsScreen.tsx');
    assert.match(src, /confirmBlock\(/);
    assert.match(src, /api\.blockUser\(/);
    assert.match(src, /accessibilityLabel=\{`Block \$\{/);
});

test('every block flow uses the shared confirm', () => {
    for (const f of ['screens/FollowListScreen.tsx', 'components/UserProfileSheet.tsx', 'screens/FriendsScreen.tsx']) {
        assert.match(read(f), /confirmBlock\(/, f);
    }
});
