import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withRepeat,
    withSequence,
    withTiming,
    cancelAnimation,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { radii } from '../../theme';
import type { AppColors, ColorRoles } from '../../theme';
import { useTheme } from '../../context/ThemeContext';
import HighlightRing from './HighlightRing';

const PITCH = "Chill vibes, great coffee, and the patio catches golden hour perfectly. Perfect for a relaxed group hangout.";

export default function SlideFiveVisual() {
    const { colors, roles: r } = useTheme();
    const styles = useMemo(() => makeStyles(colors, r), [colors, r]);
    const [displayedText, setDisplayedText] = useState('');
    const timerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
    const iRef      = useRef(0);
    const typingRef = useRef(true);

    useEffect(() => {
        const tick = () => {
            if (typingRef.current) {
                iRef.current += 1;
                setDisplayedText(PITCH.slice(0, iRef.current));
                if (iRef.current >= PITCH.length) {
                    typingRef.current = false;
                    timerRef.current = setTimeout(tick, 2000);
                } else {
                    timerRef.current = setTimeout(tick, 28);
                }
            } else {
                iRef.current = 0;
                typingRef.current = true;
                setDisplayedText('');
                timerRef.current = setTimeout(tick, 300);
            }
        };
        timerRef.current = setTimeout(tick, 500);
        return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    }, []);

    return (
        <View style={styles.card}>
            <LinearGradient
                colors={[r.primaryBorder, r.primarySoft]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.photo}
            >
                <Text style={styles.venueName}>Bryant Park Café</Text>
            </LinearGradient>

            <View style={styles.body}>
                <View style={styles.bubble}>
                    <Text style={styles.pitchText} numberOfLines={3}>
                        {displayedText}
                        <Text style={styles.cursor}>|</Text>
                    </Text>
                </View>

                <View style={styles.pillRow}>
                    <HighlightRing borderRadius={20} ringPadding={5}>
                        <LinearGradient
                            colors={colors.gradient as any}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={styles.whyPill}
                        >
                            <Text style={styles.whyText}>✨ Why this?</Text>
                        </LinearGradient>
                    </HighlightRing>
                </View>
            </View>
        </View>
    );
}

function makeStyles(colors: AppColors, r: ColorRoles) {
    return StyleSheet.create({
        card: {
            width: 240,
            height: 210,
            borderRadius: radii.xl,
            overflow: 'hidden',
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.glassBorder,
        },
        photo: {
            height: 64,
            justifyContent: 'flex-end',
            paddingHorizontal: 10,
            paddingBottom: 6,
        },
        venueName: { color: r.text, fontFamily: 'Inter_700Bold', fontSize: 12 },
        body: { flex: 1, padding: 10, gap: 8 },
        bubble: {
            flex: 1,
            backgroundColor: r.fill,
            borderRadius: radii.md,
            padding: 8,
            borderWidth: 1,
            borderColor: r.border,
        },
        pitchText: {
            color: colors.text80,
            fontSize: 10,
            fontFamily: 'Inter_400Regular',
            lineHeight: 15,
        },
        cursor: { color: colors.text40 },
        pillRow: { alignSelf: 'flex-end' },
        whyPill: {
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: 20,
            alignItems: 'center',
            justifyContent: 'center',
        },
        whyText: { color: r.onPrimary, fontSize: 11, fontFamily: 'Inter_600SemiBold' },
    });
}
