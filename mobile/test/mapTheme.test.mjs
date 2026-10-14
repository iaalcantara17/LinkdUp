import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DARK_MAP_CLASS, mapThemeClass, leafletOverridesCss } from '../src/components/mapTheme.ts';

test('dark theme gets the dark map class', () => {
    assert.equal(mapThemeClass(true), DARK_MAP_CLASS);
});

test('light theme gets no map class', () => {
    assert.equal(mapThemeClass(false), undefined);
});

test('tile filter only applies to the tile pane under the dark map class', () => {
    const filterRules = leafletOverridesCss.split('}').filter((r) => r.includes('filter:'));
    assert.ok(filterRules.length > 0);
    for (const rule of filterRules) {
        assert.match(rule, new RegExp(`^\\s*\\.${DARK_MAP_CLASS} \\.leaflet-tile-pane\\s*\\{`));
    }
});
