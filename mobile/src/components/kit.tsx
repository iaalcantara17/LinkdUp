import React, { ComponentType, ReactNode, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import {
    AccessibilityInfo, Animated, Platform, Pressable, PressableProps, StyleProp, StyleSheet, Text,
    TextInput, TextInputProps, TextStyle, View, ViewStyle,
} from 'react-native';
import Reanimated, { FadeIn } from 'react-native-reanimated';
import { ArrowLeft, X } from './icons';
import { useTheme } from '../context/ThemeContext';
import { control, duration, MotionName, motion, press, radii, radius, space, stagger, typeScale, typography } from '../theme';

let reducedNow = false;
let started = false;
const listeners = new Set<() => void>();

function setReduced(value: boolean) {
    reducedNow = !!value;
    listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void) {
    if (!started) {
        started = true;
        AccessibilityInfo.isReduceMotionEnabled().then(setReduced).catch(() => {});
        AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    }
    listeners.add(fn);
    return () => {
        listeners.delete(fn);
    };
}

export function useReducedMotion() {
    return useSyncExternalStore(subscribe, () => reducedNow, () => reducedNow);
}

export function useEntering() {
    const reduced = useReducedMotion();
    return (index = 0, speed: MotionName = 'base') =>
        reduced ? undefined : FadeIn.duration(duration(speed, false)).delay(stagger(index, false));
}

const faded = new WeakMap<ComponentType<any>, ComponentType<any>>();

export function withScreenFade<P extends object>(Screen: ComponentType<P>): ComponentType<P> {
    if (Platform.OS !== 'web') return Screen;
    if (!faded.has(Screen)) {
        faded.set(Screen, function FadedScreen(props: P) {
            const enter = useEntering();
            return (
                <Reanimated.View entering={enter(0, 'fast')} style={{ flex: 1 }}>
                    <Screen {...props} />
                </Reanimated.View>
            );
        });
    }
    return faded.get(Screen) as ComponentType<P>;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type TapProps = Omit<PressableProps, 'style' | 'children'> & {
    style?: StyleProp<ViewStyle>;
    activeOpacity?: number;
    children?: ReactNode;
    ref?: React.Ref<View>;
};

export function Tap({ style, activeOpacity = press.opacity, accessibilityRole = 'button', accessibilityState, onPressIn, onPressOut, disabled, children, ...rest }: TapProps) {
    const reduced = useReducedMotion();
    const pressed = useRef(new Animated.Value(0)).current;
    const flat = (StyleSheet.flatten(style) ?? {}) as ViewStyle;
    const base = typeof flat.opacity === 'number' ? flat.opacity : 1;
    const still = activeOpacity >= 1;
    const to = (value: number) =>
        Animated.timing(pressed, { toValue: value, duration: press.ms, useNativeDriver: Platform.OS !== 'web' }).start();
    const feedback = still
        ? null
        : {
              opacity: pressed.interpolate({ inputRange: [0, 1], outputRange: [base, base * activeOpacity] }),
              ...(flat.transform || reduced
                  ? null
                  : { transform: [{ scale: pressed.interpolate({ inputRange: [0, 1], outputRange: [1, press.scale] }) }] }),
          };
    return (
        <AnimatedPressable
            accessibilityRole={accessibilityRole}
            accessibilityState={{ disabled: !!disabled, ...accessibilityState }}
            disabled={disabled}
            onPressIn={(e) => {
                if (!still) to(1);
                onPressIn?.(e);
            }}
            onPressOut={(e) => {
                if (!still) to(0);
                onPressOut?.(e);
            }}
            style={[style, feedback] as any}
            {...rest}
        >
            {children}
        </AnimatedPressable>
    );
}

export function ScreenHeader({ title, subtitle, onBack, close, right }: { title: ReactNode; subtitle?: string | null; onBack?: () => void; close?: boolean; right?: ReactNode }) {
    const { roles } = useTheme();
    const styles = useKitStyles();
    return (
        <View style={styles.header}>
            {onBack ? (
                <Tap onPress={onBack} accessibilityLabel={close ? 'Close' : 'Back'} style={styles.headerSide} hitSlop={space.s1}>
                    {close ? <X size={24} color={roles.text} /> : <ArrowLeft size={24} color={roles.text} />}
                </Tap>
            ) : (
                <View style={styles.headerSide} />
            )}
            <View style={typeof title === 'string' ? { flex: 1 } : { flex: 1, alignItems: 'center' }}>
                {typeof title === 'string' ? <Text style={styles.headerTitle} accessibilityRole="header" numberOfLines={1}>{title}</Text> : title}
                {subtitle ? <Text style={styles.headerSub} numberOfLines={1}>{subtitle}</Text> : null}
            </View>
            <View style={[styles.headerSide, { alignItems: 'flex-end' }]}>{right}</View>
        </View>
    );
}

export function EmptyState({ emoji, title, body, action, card, style }: { emoji?: string; title: string; body?: string; action?: ReactNode; card?: boolean; style?: StyleProp<ViewStyle> }) {
    const styles = useKitStyles();
    const enter = useEntering();
    return (
        <Reanimated.View entering={enter()} style={[styles.empty, card && [styles.card, styles.emptyCard], style]}>
            {emoji ? <Text style={styles.emptyEmoji}>{emoji}</Text> : null}
            <Text style={styles.emptyTitle}>{title}</Text>
            {body ? <Text style={styles.emptyBody}>{body}</Text> : null}
            {action ? <View style={styles.emptyAction}>{action}</View> : null}
        </Reanimated.View>
    );
}

export function TextField({ left, right, containerStyle, style, ...input }: TextInputProps & { left?: ReactNode; right?: ReactNode; containerStyle?: StyleProp<ViewStyle> }) {
    const { roles } = useTheme();
    const styles = useKitStyles();
    return (
        <View style={[styles.field, containerStyle]}>
            {left}
            <TextInput placeholderTextColor={roles.textFaint} {...input} style={[styles.fieldInput, style as StyleProp<TextStyle>]} />
            {right}
        </View>
    );
}

export function Chip({ label, selected, onPress, icon, role = 'tab', style }: { label: string; selected: boolean; onPress: () => void; icon?: (color: string) => ReactNode; role?: 'tab' | 'button' | 'radio'; style?: StyleProp<ViewStyle> }) {
    const { roles } = useTheme();
    const styles = useKitStyles();
    return (
        <Tap
            accessibilityRole={role}
            accessibilityState={role === 'radio' ? { checked: selected } : { selected }}
            aria-checked={role === 'radio' ? selected : undefined}
            onPress={onPress}
            style={[styles.chip, selected && styles.chipOn, style]}
        >
            {icon?.(selected ? roles.onPrimary : roles.textMuted)}
            <Text style={[styles.chipText, selected && styles.chipTextOn]} numberOfLines={1}>{label}</Text>
        </Tap>
    );
}

export function ListRow({ left, title, subtitle, right, style }: { left?: ReactNode; title: string; subtitle?: ReactNode; right?: ReactNode; style?: StyleProp<ViewStyle> }) {
    const styles = useKitStyles();
    return (
        <View style={[styles.row, style]}>
            {left}
            <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle} numberOfLines={1}>{title}</Text>
                {typeof subtitle === 'string' ? <Text style={styles.rowSub}>{subtitle}</Text> : subtitle}
            </View>
            {right}
        </View>
    );
}

export function IconButton({ label, onPress, children, tone = 'plain' }: { label: string; onPress: () => void; children: ReactNode; tone?: 'plain' | 'primary' | 'danger' }) {
    const { colors, roles } = useTheme();
    const styles = useKitStyles();
    const fill = tone === 'primary' ? roles.primarySoft : tone === 'danger' ? roles.dangerSoft : colors.glass;
    return (
        <Tap onPress={onPress} accessibilityLabel={label} style={[styles.iconButton, { backgroundColor: fill }]}>
            {children}
        </Tap>
    );
}

export function Skeleton({ height, width = '100%', round = radius.lg, style }: { height: number; width?: number | `${number}%`; round?: number; style?: StyleProp<ViewStyle> }) {
    const { colors } = useTheme();
    const reduced = useReducedMotion();
    const pulse = useRef(new Animated.Value(1)).current;
    useEffect(() => {
        if (reduced) {
            pulse.setValue(1);
            return;
        }
        const native = Platform.OS !== 'web';
        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(pulse, { toValue: 0.5, duration: motion.base, useNativeDriver: native }),
                Animated.timing(pulse, { toValue: 1, duration: motion.base, useNativeDriver: native }),
                Animated.delay(motion.base),
            ])
        );
        loop.start();
        return () => loop.stop();
    }, [reduced, pulse]);
    return <Animated.View style={[{ height, width, borderRadius: round, backgroundColor: colors.glassStrong, opacity: pulse }, style]} />;
}

export function SkeletonList({ count, height, round = radius.lg, label }: { count: number; height: number; round?: number; label: string }) {
    return (
        <View accessible accessibilityLabel={label} accessibilityState={{ busy: true }} style={{ gap: space.s3 }}>
            {Array.from({ length: count }, (_, i) => (
                <Skeleton key={i} height={height} round={round} />
            ))}
        </View>
    );
}

function useKitStyles() {
    const { colors: c, roles: r } = useTheme();
    return useMemo(
        () =>
            StyleSheet.create({
                header: {
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingHorizontal: space.s6,
                    paddingTop: space.s2,
                    minHeight: control.md,
                },
                headerSide: { minWidth: 44, height: 44, justifyContent: 'center' },
                headerTitle: { ...typography.h3, color: r.text, textAlign: 'center' },
                headerSub: { ...typeScale.caption, color: r.textMuted, textAlign: 'center', marginTop: space.s1 },
                card: { backgroundColor: c.glass, borderRadius: radii.xl, borderWidth: 1, borderColor: c.glassBorder },
                empty: { alignItems: 'center', paddingTop: space.s12, paddingHorizontal: space.s4, gap: space.s2 },
                emptyCard: { padding: space.s6, paddingTop: space.s6 },
                emptyEmoji: { fontSize: 44, lineHeight: typeScale.display.lineHeight },
                emptyTitle: { ...typeScale.subtitle, color: r.text, textAlign: 'center' },
                emptyBody: { ...typeScale.footnote, color: r.textMuted, textAlign: 'center' },
                emptyAction: { marginTop: space.s3, alignSelf: 'stretch' },
                field: {
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: space.s3,
                    minHeight: control.md,
                    paddingHorizontal: space.s4,
                    borderRadius: radius.md,
                    borderWidth: 1,
                    borderColor: c.glassBorder,
                    backgroundColor: c.glass,
                },
                fieldInput: { ...typeScale.body, flex: 1, color: r.text, paddingVertical: space.s3 },
                chip: {
                    flexDirection: 'row',
                    gap: space.s1,
                    minHeight: 40,
                    paddingHorizontal: space.s4,
                    borderRadius: radius.pill,
                    borderWidth: 1,
                    borderColor: c.glassBorder,
                    backgroundColor: c.glass,
                    alignItems: 'center',
                    justifyContent: 'center',
                },
                chipOn: { backgroundColor: r.primary, borderColor: r.primary },
                chipText: { ...typeScale.footnote, fontFamily: 'Inter_600SemiBold', color: r.textMuted },
                chipTextOn: { color: r.onPrimary },
                row: {
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: space.s3,
                    padding: space.s4,
                    borderRadius: radius.lg,
                    borderWidth: 1,
                    borderColor: c.glassBorder,
                    backgroundColor: c.glass,
                },
                rowTitle: { ...typeScale.body, fontFamily: 'Inter_600SemiBold', color: r.text },
                rowSub: { ...typeScale.caption, color: r.textFaint },
                iconButton: { width: 44, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
            }),
        [c, r]
    );
}
