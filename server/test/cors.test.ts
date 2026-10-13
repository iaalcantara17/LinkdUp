import './env';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCorsOrigins } from '../src/config';

test('production without CORS_ORIGIN fails with a clear error', () => {
    assert.throws(() => parseCorsOrigins(undefined, 'production'), /CORS_ORIGIN/);
    assert.throws(() => parseCorsOrigins('  ', 'production'), /CORS_ORIGIN/);
});

test('production accepts a comma separated list', () => {
    assert.deepEqual(
        parseCorsOrigins('https://linkdup.vercel.app, https://www.linkdup.app', 'production'),
        ['https://linkdup.vercel.app', 'https://www.linkdup.app'],
    );
});

test('development without CORS_ORIGIN allows any origin', () => {
    assert.deepEqual(parseCorsOrigins(undefined, 'development'), ['*']);
});
