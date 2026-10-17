import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { typeScale } from '../src/theme/tokens.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const migrated = [
    'src/components/DialogHost.tsx',
    'src/components/LoadState.tsx',
    'src/components/BottomNav.tsx',
    'src/components/GradientButton.tsx',
];
const allSrc = readdirSync(root + 'src', { recursive: true })
    .map((p) => `src/${p.replaceAll('\\', '/')}`)
    .filter((p) => /\.tsx?$/.test(p) && !p.startsWith('src/theme/'));
const scale = new Set(Object.values(typeScale).map((t) => t.fontSize));

function hits(pattern, keep = () => true, files = migrated) {
    return files.flatMap((f) =>
        readFileSync(root + f, 'utf8')
            .split('\n')
            .map((line, i) => ({ where: `${f}:${i + 1}`, m: line.match(pattern) }))
            .filter(({ m }) => m && keep(m))
            .map(({ where, m }) => `${where} ${m[0]}`)
    );
}

test('every file outside the theme uses colour tokens, not hard-coded colours', () => {
    const found = hits(/#[0-9a-fA-F]{3,8}\b|rgba?\(|(?:[:?]\s*|\|\|\s*|\[\s*|,\s*|(?:[cC]olor|fill|stroke)=\{?\s*)(['"])(white|black)\1/, () => true, allSrc);
    assert.deepEqual(found, [], `Use roles or palette from src/theme/tokens:\n${found.join('\n')}`);
});

test('no file uses the 30% text colour, which fails WCAG AA for placeholders and labels', () => {
    const found = hits(/\btext30\b/, () => true, allSrc);
    assert.deepEqual(found, [], `Use textFaint or textMuted:\n${found.join('\n')}`);
});

test('every file takes colours from the theme, not a static palette', () => {
    const files = ['App.tsx', ...allSrc.filter((f) => f !== 'src/context/ThemeContext.tsx')];
    const found = hits(/import\s*\{[^}]*\b(colors|darkColors|lightColors)\b[^}]*\}\s*from\s*'(\.\.?\/)+(src\/)?theme'/, () => true, files);
    assert.deepEqual(found, [], `Use useTheme() so light mode applies:\n${found.join('\n')}`);
});

test('migrated files only use font sizes from the type scale', () => {
    const found = [
        ...hits(/fontSize:\s*(\d+)/, (m) => !scale.has(Number(m[1]))),
        ...hits(/\btypography\./),
    ];
    assert.deepEqual(found, [], `Use typeScale from src/theme/tokens:\n${found.join('\n')}`);
});
