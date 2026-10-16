import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { typeScale } from '../src/theme/tokens.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const migrated = [
    'src/components/DialogHost.tsx',
    'src/components/LoadState.tsx',
    'src/components/BottomNav.tsx',
    'src/components/GradientButton.tsx',
];
const scale = new Set(Object.values(typeScale).map((t) => t.fontSize));

function hits(pattern, keep = () => true) {
    return migrated.flatMap((f) =>
        readFileSync(root + f, 'utf8')
            .split('\n')
            .map((line, i) => ({ where: `${f}:${i + 1}`, m: line.match(pattern) }))
            .filter(({ m }) => m && keep(m))
            .map(({ where, m }) => `${where} ${m[0]}`)
    );
}

test('migrated files use colour tokens, not hard-coded colours', () => {
    const found = hits(/#[0-9a-fA-F]{3,8}\b|rgba?\(|(?:[:?]\s*|[cC]olor=\{?\s*)'(white|black)'/);
    assert.deepEqual(found, [], `Use roles or palette from src/theme/tokens:\n${found.join('\n')}`);
});

test('migrated files only use font sizes from the type scale', () => {
    const found = [
        ...hits(/fontSize:\s*(\d+)/, (m) => !scale.has(Number(m[1]))),
        ...hits(/\btypography\./),
    ];
    assert.deepEqual(found, [], `Use typeScale from src/theme/tokens:\n${found.join('\n')}`);
});
