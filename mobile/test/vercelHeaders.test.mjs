import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));

function cacheFor(path) {
    const rules = (config.headers ?? []).filter((r) => new RegExp(`^${r.source}$`).test(path));
    const values = rules.flatMap((r) => r.headers.filter((h) => h.key.toLowerCase() === 'cache-control').map((h) => h.value));
    assert.equal(values.length, 1, `${path} should match exactly one Cache-Control rule, got ${JSON.stringify(values)}`);
    return values[0];
}

test('hashed bundles under /_expo/static are cached forever', () => {
    for (const p of ['/_expo/static/js/web/AppEntry-2be9eea92acb0eba37987978cd99a384.js', '/_expo/static/css/leaflet-df687fead8c4838a4e6b8bcb2f176a0e.css']) {
        assert.equal(cacheFor(p), 'public, max-age=31536000, immutable');
    }
});

test('index.html, app routes and other unhashed files always revalidate', () => {
    for (const p of ['/', '/index.html', '/favicon.ico', '/robots.txt', '/og-image.png', '/manifest.webmanifest', '/apple-touch-icon.png','/metadata.json', '/party/abc', '/assets/node_modules/x.ttf']) {
        assert.equal(cacheFor(p), 'no-cache');
    }
});

test('a missing hashed bundle is a 404, not index.html cached for a year', () => {
    const spa = config.rewrites.find((r) => r.destination === '/index.html');
    assert.equal(new RegExp(`^${spa.source}$`).test('/_expo/static/js/web/AppEntry-old.js'), false);
    assert.equal(new RegExp(`^${spa.source}$`).test('/party/abc'), true);
});
