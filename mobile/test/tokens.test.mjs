import { test } from 'node:test';
import assert from 'node:assert/strict';
import { color, palette, typeScale, space, radius } from '../src/theme/tokens.ts';

function rgba(value) {
    const hex = /^#([0-9a-f]{6})$/i.exec(value);
    if (hex) return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16)).concat(1);
    const fn = /^rgba?\(([^)]+)\)$/.exec(value);
    assert.ok(fn, `unparseable colour ${value}`);
    const [r, g, b, a = 1] = fn[1].split(',').map(Number);
    return [r, g, b, a];
}

function over(fg, bg) {
    const [r, g, b, a] = rgba(fg);
    const base = rgba(bg);
    return [r, g, b].map((c, i) => c * a + base[i] * (1 - a));
}

function luminance(rgb) {
    const [r, g, b] = rgb.map((c) => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(fg, bg) {
    const [hi, lo] = [luminance(over(fg, bg)), luminance(rgba(bg).slice(0, 3))].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
}

for (const theme of ['dark', 'light']) {
    const c = color[theme];
    for (const role of ['text', 'textMuted', 'textFaint', 'primaryText', 'success', 'warning']) {
        for (const bg of ['background', 'surface', 'surfaceRaised']) {
            test(`${theme} ${role} on ${bg} meets WCAG AA 4.5:1`, () => {
                const ratio = contrast(c[role], c[bg]);
                assert.ok(ratio >= 4.5, `${theme} ${role} ${c[role]} on ${bg} ${c[bg]} is ${ratio.toFixed(2)}:1`);
            });
        }
    }
    for (const [fg, scrim] of [['onMedia', 'scrim'], ['onMedia', 'scrimStrong'], ['onMediaMuted', 'scrimStrong']]) {
        test(`${theme} ${fg} on ${scrim} over a white photo meets WCAG AA 4.5:1`, () => {
            const backdrop = `rgb(${over(c[scrim], palette.white).join(',')})`;
            const ratio = contrast(c[fg], backdrop);
            assert.ok(ratio >= 4.5, `${theme} ${fg} on ${scrim} over white is ${ratio.toFixed(2)}:1`);
        });
    }
    const on = (tint, base) => `rgb(${over(tint, base).join(',')})`;
    for (const bg of ['background', 'surface']) {
        test(`${theme} danger text on ${bg} meets WCAG AA 4.5:1`, () => {
            const ratio = contrast(c.danger, c[bg]);
            assert.ok(ratio >= 4.5, `${theme} danger ${c.danger} on ${bg} is ${ratio.toFixed(2)}:1`);
        });
    }
    test(`${theme} danger text on dangerSoft meets WCAG AA 4.5:1`, () => {
        const ratio = contrast(c.danger, on(c.dangerSoft, c.background));
        assert.ok(ratio >= 4.5, `${theme} danger on dangerSoft is ${ratio.toFixed(2)}:1`);
    });
    test(`${theme} warning text on warningSoft meets WCAG AA 4.5:1`, () => {
        const ratio = contrast(c.warning, on(c.warningSoft, c.background));
        assert.ok(ratio >= 4.5, `${theme} warning on warningSoft is ${ratio.toFixed(2)}:1`);
    });
    test(`${theme} onMedia on mediaFill over a scrimmed white photo meets WCAG AA 4.5:1`, () => {
        const ratio = contrast(c.onMedia, on(c.mediaFill, on(c.scrimStrong, palette.white)));
        assert.ok(ratio >= 4.5, `${theme} onMedia on mediaFill is ${ratio.toFixed(2)}:1`);
    });
    test(`${theme} switchThumb on the primary track meets WCAG non-text 3:1`, () => {
        const ratio = contrast(c.switchThumb, c.primary);
        assert.ok(ratio >= 3, `${theme} switchThumb on primary is ${ratio.toFixed(2)}:1`);
    });
    for (const fill of ['primary', 'gradientEnd', 'successFill', 'dangerStrong']) {
        test(`${theme} onPrimary on ${fill} meets WCAG AA 4.5:1`, () => {
            const ratio = contrast(c.onPrimary, c[fill]);
            assert.ok(ratio >= 4.5, `${theme} onPrimary on ${fill} is ${ratio.toFixed(2)}:1`);
        });
    }
}

test('dark colour roles keep today\'s dark values', () => {
    const d = color.dark;
    assert.deepEqual(
        [d.background, d.surface, d.surfaceRaised, d.border, d.text, d.textMuted, d.primary, d.accent, d.danger, d.dangerStrong, d.success, d.warning],
        ['#0A0A0F', '#15151F', '#1F1F2E', 'rgba(255,255,255,0.10)', '#FFFFFF', 'rgba(255,255,255,0.60)', '#6C3EF4', '#00C2FF', '#EF4444', '#B91C1C', '#22C55E', '#FACC15']
    );
});

test('the type scale has the eight named steps in ascending size with line heights', () => {
    const names = ['caption', 'footnote', 'body', 'bodyStrong', 'subtitle', 'title', 'headline', 'display'];
    assert.deepEqual(Object.keys(typeScale), names);
    const sizes = names.map((n) => typeScale[n].fontSize);
    assert.deepEqual([...sizes].sort((a, b) => a - b), sizes);
    for (const n of names) assert.ok(typeScale[n].lineHeight >= typeScale[n].fontSize, n);
});

test('spacing sits on the 4 point grid and radii are sm, md, lg, pill', () => {
    assert.deepEqual(Object.values(space), [4, 8, 12, 16, 20, 24, 32, 40, 48]);
    assert.deepEqual(Object.keys(radius), ['sm', 'md', 'lg', 'pill']);
});
