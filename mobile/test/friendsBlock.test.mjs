import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');

test('friend rows offer Block through the shared confirm', () => {
    const src = read('screens/FriendsScreen.tsx');
    assert.match(src, /confirmBlock\(/);
    assert.match(src, /api\.blockUser\(/);
    assert.match(src, /(accessibilityLabel|label)=\{`Block \$\{/);
});

test('the app uses follows only, with no friend request calls or wording left', () => {
    const files = readdirSync(new URL('../src/', import.meta.url), { recursive: true }).filter((f) => /\.tsx?$/.test(f));
    const gone = /getPendingRequests|getOutgoingRequests|sendFriendRequest|acceptFriendRequest|declineFriendRequest|removeFriend\b|getFriendStatus|\/api\/friends\/(request|pending|outgoing|status)|friendship/;
    const wording = /friend requests?|add friend|request sent|request pending|accept request|wants to be friends|pending requests?/i;
    for (const f of files) {
        const src = read(f.replace(/\\/g, '/'));
        assert.doesNotMatch(src, gone, f);
        assert.doesNotMatch(src, wording, f);
    }
});

test('every block flow uses the shared confirm', () => {
    for (const f of ['screens/FollowListScreen.tsx', 'components/UserProfileSheet.tsx', 'screens/FriendsScreen.tsx']) {
        assert.match(read(f), /confirmBlock\(/, f);
    }
});

test('Report opens the report dialog, sends it to the server and thanks the person', () => {
    const sheet = read('components/UserProfileSheet.tsx');
    const dialog = read('components/ReportDialog.tsx');
    assert.doesNotMatch(sheet, /Reporting isn't available yet/);
    assert.match(sheet, /<ReportDialog/);
    assert.match(dialog, /api\.reportUser\(/);
    assert.match(dialog, /Thanks, we'll take a look\./);
    for (const src of [sheet, dialog]) assert.doesNotMatch(src, /review/i);
});

test('Report lives only in the profile sheet menu, behind a labeled button', () => {
    const sheet = read('components/UserProfileSheet.tsx');
    assert.match(sheet, /label: 'Report'/);
    assert.match(sheet, /accessibilityLabel=\{`More options for \$\{/);
    const others = ['screens/FriendsScreen.tsx', 'screens/FollowListScreen.tsx', 'screens/ProfileScreen.tsx', 'components/FeedCard.tsx', 'components/CommentSheet.tsx'];
    for (const f of others) assert.doesNotMatch(read(f), /'Report'/, f);
});
