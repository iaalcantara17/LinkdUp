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

test('report does not promise a review that never happens', () => {
    const src = read('components/UserProfileSheet.tsx');
    assert.doesNotMatch(src, /review/i);
    assert.match(src, /Reporting isn't available yet/);
});

test('Report lives only in the profile sheet menu, behind a labeled button', () => {
    const sheet = read('components/UserProfileSheet.tsx');
    assert.match(sheet, /label: 'Report'/);
    assert.match(sheet, /accessibilityLabel=\{`More options for \$\{/);
    const others = ['screens/FriendsScreen.tsx', 'screens/FollowListScreen.tsx', 'screens/ProfileScreen.tsx', 'components/FeedCard.tsx', 'components/CommentSheet.tsx'];
    for (const f of others) assert.doesNotMatch(read(f), /'Report'/, f);
});
