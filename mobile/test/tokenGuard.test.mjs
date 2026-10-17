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
const lightMode = [
    ...migrated,
    'src/screens/LoginScreen.tsx',
    'src/screens/OnboardingScreen.tsx',
    'src/screens/HomeScreen.tsx',
    'src/screens/DiscoverScreen.tsx',
    'src/screens/PartyLobbyScreen.tsx',
    'src/components/HelpButton.tsx',
    'src/components/AnchoredHint.tsx',
    'src/components/FeedView.tsx',
    'src/components/FirstVisitHint.tsx',
    'src/components/PlaceSearch.tsx',
    'src/components/GlassCard.tsx',
    'src/components/AvatarBubble.tsx',
    'src/components/UserProfileSheet.tsx',
    'src/components/CrewMap.tsx',
    'src/components/LocationSourceCard.tsx',
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

test('migrated files take colours from the theme, not the static dark palette', () => {
    const found = hits(/import\s*\{[^}]*\bcolors\b[^}]*\}\s*from\s*'\.\.\/theme'/, () => true, lightMode);
    assert.deepEqual(found, [], `Use useTheme() so light mode applies:\n${found.join('\n')}`);
});

test('migrated files only use font sizes from the type scale', () => {
    const found = [
        ...hits(/fontSize:\s*(\d+)/, (m) => !scale.has(Number(m[1]))),
        ...hits(/\btypography\./),
    ];
    assert.deepEqual(found, [], `Use typeScale from src/theme/tokens:\n${found.join('\n')}`);
});
