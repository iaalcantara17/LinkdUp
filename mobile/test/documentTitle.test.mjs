import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { routeTitles, documentTitle } from '../src/navigation/titles.ts';

const read = (p) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
const routes = [...read('../src/navigation/MainStack.tsx').matchAll(/<Stack\.Screen name="(\w+)"/g), ...read('../src/navigation/AuthStack.tsx').matchAll(/<Stack\.Screen name="(\w+)"/g)].map((m) => m[1]);

test('every stack route has a readable document title', () => {
    assert.ok(routes.length > 20);
    assert.deepEqual(routes.filter((r) => !routeTitles[r]), []);
});

test('document title pairs the route title with the app name', () => {
    assert.equal(documentTitle('PartyLobby'), 'Party Lobby · LinkdUp');
    assert.equal(documentTitle('Unknown'), 'LinkdUp');
    assert.equal(documentTitle(undefined), 'LinkdUp');
});
