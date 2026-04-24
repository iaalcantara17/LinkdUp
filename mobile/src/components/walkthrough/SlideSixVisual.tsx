import React, { useEffect } from 'react';
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
import { colors, radii } from '../../theme';

const WEEK_DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DATES     = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21];
const HIGHLIGHT = 14;

export default function SlideSixVisual() {
    const arrowOpacity = useSharedValue(0.35);

    useEffect(() => {
        arrowOpacity.value = withRepeat(
            withSequence(
                withTiming(0.35, { duration: 700 }),
                withTiming(1.0,  { duration: 700 }),
            ),
            -1,
            false
        );
        return () => { cancelAnimation(arrowOpacity); };
    }, []);

    const arrowStyle = useAnimatedStyle(() => ({ opacity: arrowOpacity.value }));

    return (
        <View style={styles.root}>
            <View style={styles.calCard}>
                <View style={styles.calHeader}>
                    <Text style={styles.calMonth}>April 2026</Text>
                </View>
                <View style={styles.weekRow}>
                    {WEEK_DAYS.map((d, i) => (
                        <Text key={i} style={styles.dayLabel}>{d}</Text>
                    ))}
                </View>
                <View style={styles.grid}>
                    {DATES.map(d => (
                        d === HIGHLIGHT ? (
                            <LinearGradient
                                key={d}
                                colors={colors.gradient as any}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={styles.dateHighlight}
                            >
                                <Text style={styles.dateNumWhite}>{d}</Text>
                            </LinearGradient>
                        ) : (
                            <View key={d} style={styles.dateCell}>
                                <Text style={styles.dateNum}>{d}</Text>
                            </View>
                        )
                    ))}
                </View>
                <Text style={styles.satLabel}>Sat — locked in</Text>
            </View>

            <Animated.View style={[styles.arrowWrap, arrowStyle]}>
                <Text style={styles.arrowText}>›</Text>
                <Text style={styles.arrowText}>›</Text>
                <Text style={styles.arrowText}>›</Text>
            </Animated.View>

            <View style={styles.gcalCard}>
                <View style={styles.gcalHeader}>
                    <Text style={styles.gcalNum}>31</Text>
                </View>
                <View style={styles.gcalBody}>
                    <View style={[styles.gcalDot, { backgroundColor: '#4285F4' }]} />
                    <View style={[styles.gcalDot, { backgroundColor: '#EA4335' }]} />
                    <View style={[styles.gcalDot, { backgroundColor: '#34A853' }]} />
                    <View style={[styles.gcalDot, { backgroundColor: '#FBBC05' }]} />
                </View>
                <Text style={styles.gcalLabel}>Google{'\n'}Calendar</Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    calCard: {
        width: 140,
        backgroundColor: colors.surface,
        borderRadius: radii.lg,
        borderWidth: 1,
        borderColor: colors.glassBorder,
        overflow: 'hidden',
    },
    calHeader: {
        backgroundColor: 'rgba(108,62,244,0.25)',
        paddingVertical: 6,
        paddingHorizontal: 8,
    },
    calMonth: { color: 'white', fontFamily: 'Inter_700Bold', fontSize: 10 },
    weekRow: {
        flexDirection: 'row',
        paddingHorizontal: 4,
        paddingTop: 4,
    },
    dayLabel: {
        flex: 1,
        textAlign: 'center',
        color: colors.text40,
        fontSize: 8,
        fontFamily: 'Inter_700Bold',
    },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        paddingHorizontal: 4,
        paddingBottom: 4,
    },
    dateCell: {
        width: `${100 / 7}%` as any,
        aspectRatio: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    dateHighlight: {
        width: `${100 / 7}%` as any,
        aspectRatio: 1,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 4,
    },
    dateNum:      { color: colors.text60, fontSize: 8, fontFamily: 'Inter_400Regular' },
    dateNumWhite: { color: 'white', fontSize: 8, fontFamily: 'Inter_700Bold' },
    satLabel: {
        color: colors.primary,
        fontSize: 8,
        fontFamily: 'Inter_600SemiBold',
        textAlign: 'center',
        paddingBottom: 6,
    },
    arrowWrap: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    arrowText: {
        color: colors.primary,
        fontSize: 22,
        fontFamily: 'Inter_700Bold',
        lineHeight: 22,
    },
    gcalCard: {
        width: 80,
        height: 88,
        backgroundColor: 'white',
        borderRadius: radii.md,
        overflow: 'hidden',
        alignItems: 'center',
    },
    gcalHeader: {
        width: '100%',
        backgroundColor: '#1A73E8',
        paddingVertical: 4,
        alignItems: 'center',
    },
    gcalNum: { color: 'white', fontFamily: 'Inter_700Bold', fontSize: 14 },
    gcalBody: {
        flex: 1,
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 4,
        padding: 8,
        justifyContent: 'center',
        alignItems: 'center',
    },
    gcalDot: { width: 10, height: 10, borderRadius: 5 },
    gcalLabel: {
        color: '#444',
        fontSize: 8,
        fontFamily: 'Inter_700Bold',
        textAlign: 'center',
        paddingBottom: 5,
        lineHeight: 10,
    },
});
