import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cleanCode, codeFromPath, joinUrl, rememberJoin, takeJoin } from '../src/services/joinLink.ts';

const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');

function memory() {
    const m = new Map();
    return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

test('codes are cleaned to six uppercase letters and digits', () => {
    assert.equal(cleanCode(' ab-c2 34x '), 'ABC234');
    assert.equal(cleanCode('abc'), 'ABC');
    assert.equal(cleanCode(''), '');
});

test('the join link points at the Join screen with the code', () => {
    assert.equal(joinUrl('ABC234'), 'https://linkdup.app/join/ABC234');
    assert.equal(joinUrl('ABC234', 'https://preview.vercel.app'), 'https://preview.vercel.app/join/ABC234');
});

test('a join path gives back its code, anything else gives null', () => {
    assert.equal(codeFromPath('/join/abc234'), 'ABC234');
    assert.equal(codeFromPath('/join/ABC234/'), 'ABC234');
    assert.equal(codeFromPath('/join/AB'), null);
    assert.equal(codeFromPath('/join'), null);
    assert.equal(codeFromPath('/home'), null);
});

test('a signed-out visitor keeps the code until Home takes it once', () => {
    const store = memory();
    rememberJoin('/onboarding', store);
    assert.equal(takeJoin(store), null);
    rememberJoin('/join/abc234', store);
    assert.equal(takeJoin(store), 'ABC234');
    assert.equal(takeJoin(store), null);
    assert.equal(takeJoin(undefined), null);
    rememberJoin('/join/abc234', undefined);
});

test('the app links /join/:code to the Join screen', () => {
    assert.match(app, /JoinParty: 'join\/:code\?'/);
    assert.match(app, /'https:\/\/linkdup\.app'/);
});
