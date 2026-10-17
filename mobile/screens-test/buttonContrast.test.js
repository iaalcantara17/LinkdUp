import React from 'react';
import { Text } from 'react-native';
import { render, screen, cleanup } from '@testing-library/react';
import { color } from '../src/theme';
import GradientButton from '../src/components/GradientButton';

jest.mock('expo-linear-gradient', () => {
    const { View } = require('react-native');
    return { LinearGradient: ({ colors, style, children }) => <View style={style} dataSet={{ stops: colors.join('|') }}>{children}</View> };
});

function rgba(value) {
    const m = /rgba?\(([^)]+)\)/.exec(value);
    if (!m) return null;
    const [r, g, b, a = 1] = m[1].split(',').map(Number);
    return [r, g, b, a];
}

function css(value) {
    const hex = /^#([0-9a-f]{6})$/i.exec(value);
    return hex ? [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16)).concat(1) : rgba(value);
}

const over = (fg, bg) => [0, 1, 2].map((i) => fg[i] * fg[3] + bg[i] * (1 - fg[3])).concat(1);

function luminance(c) {
    const [r, g, b] = c.slice(0, 3).map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(fg, bg) {
    const [hi, lo] = [luminance(over(fg, bg)), luminance(bg)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
}

function fills(el, page) {
    const layers = [];
    for (let n = el; n; n = n.parentElement) {
        const cs = getComputedStyle(n);
        const stops = (n.dataset?.stops?.split('|') ?? []).map(css);
        const solid = rgba(cs.backgroundColor);
        if (stops.length) layers.push(stops);
        else if (solid && solid[3] > 0) layers.push([solid]);
    }
    let base = [css(page)];
    for (const layer of layers.reverse()) base = layer.flatMap((s) => base.map((b) => over(s, b)));
    return base;
}

const worst = (el, page) => Math.min(...fills(el, page).map((bg) => ratio(rgba(getComputedStyle(el).color), bg)));

const Probe = ({ color: tint }) => <Text testID="icon" style={{ color: tint }}>*</Text>;

afterEach(() => {
    cleanup();
    global.__theme = undefined;
});

for (const theme of ['light', 'dark']) {
    const r = color[theme];
    const page = r.background;

    for (const variant of ['gradient', 'ghost', 'white']) {
        test(`${theme} ${variant} button text reaches 4.5:1 on its rendered fill`, () => {
            global.__theme = theme;
            render(<GradientButton title="Go" variant={variant} onPress={() => {}} />);
            const value = worst(screen.getByText('Go'), page);
            expect(value).toBeGreaterThanOrEqual(4.5);
        });

        for (const disabled of [false, true]) {
            test(`${theme} ${variant}${disabled ? ' disabled' : ''} button draws its icons in the label colour`, () => {
                global.__theme = theme;
                render(<GradientButton title="Go" variant={variant} disabled={disabled} onPress={() => {}} rightIcon={<Probe color={r.onPrimary} />} />);
                expect(getComputedStyle(screen.getByTestId('icon')).color).toBe(getComputedStyle(screen.getByText('Go')).color);
            });
        }
    }
}
