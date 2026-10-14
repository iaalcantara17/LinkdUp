import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

function sources(dir) {
    return readdirSync(dir).flatMap((name) => {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) return sources(p);
        return /\.(ts|tsx|js|jsx)$/.test(name) ? [p] : [];
    });
}

test('mobile source never calls Alert.alert or window.confirm', () => {
    const files = [...sources(join(root, 'src')), join(root, 'App.tsx')];
    const hits = files.flatMap((f) =>
        readFileSync(f, 'utf8')
            .split('\n')
            .map((line, i) => ({ f, i: i + 1, line }))
            .filter(({ line }) => /Alert\.alert|window(\s+as\s+any\))?\.confirm\(/.test(line))
            .map(({ f, i }) => `${f}:${i}`)
    );
    assert.deepEqual(hits, [], `Use confirm/showError/toast from src/components/dialogs instead:\n${hits.join('\n')}`);
});
