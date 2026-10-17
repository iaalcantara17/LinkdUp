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

test('mobile source never imports the lucide-react-native barrel', () => {
    const files = [...sources(join(root, 'src')), join(root, 'App.tsx')];
    const hits = files.flatMap((f) =>
        readFileSync(f, 'utf8')
            .split('\n')
            .map((line, i) => ({ f, i: i + 1, line }))
            .filter(({ line }) => /['"]lucide-react-native(\/icons)?['"]/.test(line))
            .map(({ f, i }) => `${f}:${i}`)
    );
    assert.deepEqual(hits, [], `Import icons from src/components/icons, which re-exports lucide-react-native/icons/<name>:\n${hits.join('\n')}`);
});
