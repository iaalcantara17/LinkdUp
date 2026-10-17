import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const pub = new URL('../public/', import.meta.url);
const html = readFileSync(new URL('index.html', pub), 'utf8');
const app = JSON.parse(readFileSync(new URL('../app.json', import.meta.url), 'utf8')).expo;

function meta(attr, name) {
    const tag = html.match(new RegExp(`<meta[^>]*${attr}="${name}"[^>]*>`, 'g')) ?? [];
    assert.equal(tag.length, 1, `exactly one ${attr}="${name}" tag`);
    return tag[0].match(/content="([^"]*)"/)[1];
}

function pngSize(file) {
    const b = readFileSync(file);
    assert.equal(b.toString('ascii', 1, 4), 'PNG', `${file} is a PNG`);
    return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

test('the page has a title, description, theme color and canonical URL', () => {
    assert.match(html, /<title>LinkdUp[^<]*<\/title>/);
    assert.ok(meta('name', 'description').length > 40);
    assert.match(meta('name', 'theme-color'), /^#[0-9A-Fa-f]{6}$/);
    assert.match(html, /<link rel="canonical" href="https:\/\/linkdup\.app\/?"/);
});

test('Expo does not add a second theme-color or description from app.json', () => {
    assert.equal(app.web.themeColor, undefined);
    assert.equal(app.web.description, undefined);
});

test('Open Graph and Twitter tags describe the site with an absolute 1200x630 image', () => {
    assert.equal(meta('property', 'og:type'), 'website');
    assert.equal(meta('property', 'og:url'), 'https://linkdup.app/');
    assert.match(meta('property', 'og:title'), /LinkdUp/);
    assert.ok(meta('property', 'og:description').length > 40);
    const image = meta('property', 'og:image');
    assert.equal(image, 'https://linkdup.app/og-image.png');
    assert.equal(meta('property', 'og:image:width'), '1200');
    assert.equal(meta('property', 'og:image:height'), '630');
    assert.ok(meta('property', 'og:image:alt').length > 10);
    assert.equal(meta('name', 'twitter:card'), 'summary_large_image');
    assert.equal(meta('name', 'twitter:image'), image);
    assert.match(meta('name', 'twitter:title'), /LinkdUp/);
});

test('the preview image ships in the web build at 1200x630', () => {
    assert.deepEqual(pngSize(new URL('og-image.png', pub)), [1200, 630]);
});

test('robots.txt ships in the web build', () => {
    assert.ok(existsSync(new URL('robots.txt', pub)));
});

test('the template keeps the Expo placeholders and the root element', () => {
    for (const s of ['%LANG_ISO_CODE%', '<div id="root"></div>', '</head>', 'name="viewport"']) assert.ok(html.includes(s), s);
});
