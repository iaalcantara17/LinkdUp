import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import {
    confirm,
    showError,
    showInfo,
    showMenu,
    toast,
    dismissToast,
    respond,
    dismiss,
    getSnapshot,
    subscribe,
    errorText,
    claimHost,
    TOAST_MS,
} from '../src/components/dialogs.ts';

const current = () => getSnapshot().dialog;

test('confirm resolves true when the confirm button is pressed', async () => {
    const p = confirm({ title: 'Remove friend?', confirmLabel: 'Remove' });
    assert.deepEqual(current().buttons.map((b) => b.label), ['Cancel', 'Remove']);
    respond(1);
    assert.equal(await p, true);
    assert.equal(current(), null);
});

test('confirm resolves false on cancel and on dismiss', async () => {
    const a = confirm({ title: 'A' });
    respond(0);
    assert.equal(await a, false);
    const b = confirm({ title: 'B' });
    dismiss();
    assert.equal(await b, false);
});

test('dialogs queue in order and never replace the open one', async () => {
    const first = confirm({ title: 'First' });
    const second = showError('Second');
    assert.equal(current().title, 'First');
    respond(1);
    assert.equal(await first, true);
    assert.equal(current().title, 'Second');
    respond(0);
    await second;
    assert.equal(current(), null);
});

test('destructive confirm marks the confirm button and uses alertdialog', async () => {
    const p = confirm({ title: 'Block?', confirmLabel: 'Block', destructive: true });
    const d = current();
    assert.equal(d.role, 'alertdialog');
    assert.equal(d.buttons[1].style, 'destructive');
    assert.equal(d.buttons[0].style, 'cancel');
    respond(0);
    await p;
    const q = confirm({ title: 'Plain' });
    assert.equal(current().buttons[1].style, 'default');
    respond(0);
    await q;
});

test('error and info dialogs have one OK button and the right role', async () => {
    const e = showError("Couldn't save", 'Try again.');
    assert.equal(current().role, 'alertdialog');
    assert.equal(current().message, 'Try again.');
    assert.deepEqual(current().buttons.map((b) => b.label), ['OK']);
    respond(0);
    await e;
    const i = showInfo('Almost there');
    assert.equal(current().role, 'dialog');
    dismiss();
    await i;
});

test('menu runs only the chosen action, and cancel runs none', async () => {
    const ran = [];
    const actions = [
        { label: 'View profile', onPress: () => ran.push('view') },
        { label: 'Block', destructive: true, onPress: () => ran.push('block') },
    ];
    const a = showMenu('Sam', actions);
    assert.deepEqual(current().buttons.map((b) => b.style), ['default', 'destructive', 'cancel']);
    respond(1);
    await a;
    assert.deepEqual(ran, ['block']);
    const b = showMenu('Sam', actions);
    respond(2);
    await b;
    const c = showMenu('Sam', actions);
    dismiss();
    await c;
    assert.deepEqual(ran, ['block']);
});

test('subscribers hear changes until they unsubscribe', async () => {
    let calls = 0;
    const off = subscribe(() => { calls++; });
    const p = confirm({ title: 'X' });
    respond(0);
    await p;
    assert.equal(calls, 2);
    off();
    const q = confirm({ title: 'Y' });
    respond(0);
    await q;
    assert.equal(calls, 2);
});

test('only the most recently mounted host renders, so dialogs show above open sheets', () => {
    assert.equal(getSnapshot().host, null);
    const releaseRoot = claimHost(101);
    assert.equal(getSnapshot().host, 101);
    const releaseSheet = claimHost(202);
    assert.equal(getSnapshot().host, 202);
    releaseSheet();
    assert.equal(getSnapshot().host, 101);
    releaseRoot();
    assert.equal(getSnapshot().host, null);
});

test('toasts show without blocking dialogs and expire on their own', () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    try {
        toast('Added to Google Calendar');
        const [t] = getSnapshot().toasts;
        assert.equal(t.message, 'Added to Google Calendar');
        assert.equal(t.tone, 'success');
        assert.equal(current(), null);
        mock.timers.tick(TOAST_MS - 1);
        assert.equal(getSnapshot().toasts.length, 1);
        mock.timers.tick(1);
        assert.equal(getSnapshot().toasts.length, 0);
        toast('Copied', 'info');
        dismissToast(getSnapshot().toasts[0].id);
        assert.equal(getSnapshot().toasts.length, 0);
    } finally {
        mock.timers.reset();
    }
});

test('errorText hides raw server codes behind friendly text', () => {
    const fb = 'Try again.';
    assert.equal(errorText(new Error('blocked'), fb), "You can't do that with this person.");
    assert.equal(errorText(new Error('some_new_code'), fb), fb);
    assert.equal(errorText(new Error('HTTP 500'), fb), fb);
    assert.equal(errorText(new Error('Upload failed: 413'), fb), fb);
    for (const offline of ['Failed to fetch', 'Load failed', 'NetworkError when attempting to fetch resource.', 'Network request failed']) {
        assert.match(errorText(new Error(offline), fb), /Check your connection/);
    }
    assert.equal(errorText(new Error('unknown'), fb), fb);
    assert.equal(errorText(undefined, fb), fb);
    assert.equal(errorText(new Error('Email is already registered.'), fb), 'Email is already registered.');
});

test('server codes users can hit on swipe and sign-in have friendly text', () => {
    const fb = 'fallback';
    for (const code of ['party_not_swiping', 'invalid_credentials', 'email_taken', 'not_solo_party', 'rate_limited']) {
        const text = errorText(new Error(code), fb);
        assert.notEqual(text, fb, code);
        assert.doesNotMatch(text, /_/, code);
    }
});
