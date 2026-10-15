import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { settleFinishedAnimations } from '../src/services/webAnimations.ts';

function fakeDoc() {
    const listeners = new Map();
    return {
        listeners,
        addEventListener: (type, fn, capture) => listeners.set(type, { fn, capture }),
        removeEventListener: (type) => listeners.delete(type),
        end: (target, animationName) => listeners.get('animationend')?.fn({ target, animationName }),
    };
}

test('a finished entering animation is cleared so showing a hidden screen again does not replay it', () => {
    const doc = fakeDoc();
    settleFinishedAnimations(doc);
    const card = { style: { animationName: 'FadeInDown' } };
    doc.end(card, 'FadeInDown');
    assert.equal(card.style.animationName, '');
    assert.equal(doc.listeners.get('animationend').capture, true);
});

test('an entering animation cancelled by hiding the screen is cleared too', () => {
    const doc = fakeDoc();
    settleFinishedAnimations(doc);
    const card = { style: { animationName: 'FadeInDown' } };
    doc.listeners.get('animationcancel').fn({ target: card, animationName: 'FadeInDown' });
    assert.equal(card.style.animationName, '');
});

test('animations set by class or a different inline animation are left alone', () => {
    const doc = fakeDoc();
    settleFinishedAnimations(doc);
    const spinner = { style: { animationName: '' } };
    const other = { style: { animationName: 'SlideIn' } };
    doc.end(spinner, 'spin');
    doc.end(other, 'FadeIn');
    doc.end({}, 'FadeIn');
    assert.equal(spinner.style.animationName, '');
    assert.equal(other.style.animationName, 'SlideIn');
});

test('stopping removes the listener', () => {
    const doc = fakeDoc();
    settleFinishedAnimations(doc)();
    assert.equal(doc.listeners.has('animationend'), false);
    assert.equal(doc.listeners.has('animationcancel'), false);
});

test('the app settles animations on web before anything renders', () => {
    const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
    assert.match(app, /if \(Platform\.OS === 'web' && typeof document !== 'undefined'\) settleFinishedAnimations\(document\);/);
});
