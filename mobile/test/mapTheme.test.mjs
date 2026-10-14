import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TILE_URL, TILE_ATTRIBUTION, leafletOverridesCss, mapThemeClass } from '../src/components/mapTheme.ts';

test('tiles come from OpenStreetMap with OpenStreetMap attribution only', () => {
    assert.equal(TILE_URL, 'https://tile.openstreetmap.org/{z}/{x}/{y}.png');
    assert.match(TILE_ATTRIBUTION, /openstreetmap\.org\/copyright/);
    assert.doesNotMatch(TILE_ATTRIBUTION, /carto/i);
});

test('CrewMap.web uses the shared tile settings and no CARTO tiles', () => {
    const src = readFileSync(new URL('../src/components/CrewMap.web.tsx', import.meta.url), 'utf8');
    assert.doesNotMatch(src, /carto|basemaps|dark_all/i);
    assert.match(src, /url=\{TILE_URL\}/);
    assert.match(src, /attribution=\{TILE_ATTRIBUTION\}/);
    assert.match(src, /className=\{mapThemeClass\(isDark\)\}/);
});

test('dark theme filters the tile pane only', () => {
    assert.equal(mapThemeClass(true), 'linkdup-map-dark');
    assert.equal(mapThemeClass(false), '');
    const rules = leafletOverridesCss.match(/[^{}]+\{[^{}]*filter:[^}]*\}/g) ?? [];
    assert.equal(rules.length, 1);
    assert.match(rules[0], /^\s*\.linkdup-map-dark \.leaflet-tile-pane\s*\{/);
});
