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
import { Plus } from 'lucide-react-native';
import { colors, radii } from '../../theme';
import Callout from './Callout';

export default function SlideTwoVisual() {
    const glowOpacity = useSharedValue(0.35);

    useEffect(() => {
        glowOpacity.value = withRepeat(
            withSequence(
                withTiming(0.35, { duration: 900 }),
                withTiming(1.0,  { duration: 600 }),
            ),
            -1,
            false
        );
        return () => { cancelAnimation(glowOpacity); };
    }, []);

    const glowStyle = useAnimatedStyle(() => ({ opacity: glowOpacity.value }));

    return (
        <View style={styles.card}>
            <Text style={styles.sectionLabel}>YOUR PARTIES</Text>

            <View style={styles.partyCard}>
                <View style={styles.partyDot} />
                <View>
                    <Text style={styles.partyName}>Saturday Meetup</Text>
                    <Text style={styles.partySub}>4 members · waiting</Text>
                </View>
            </View>

            <View style={styles.fabArea}>
                <Callout text="Tap to create" position="bottom" />
                <View style={{ height: 6 }} />
                <View style={styles.fabWrap}>
                    <Animated.View style={[styles.fabGlow, glowStyle]} />
                    <LinearGradient
                        colors={colors.gradient as any}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.fab}
                    >
                        <Plus size={22} color="white" />
                    </LinearGradient>
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        width: 260,
        height: 185,
        backgroundColor: colors.surface,
        borderRadius: radii.xl,
        borderWidth: 1,
        borderColor: colors.glassBorder,
        padding: 14,
    },
    sectionLabel: {
        color: colors.text40,
        fontSize: 9,
        fontFamily: 'Inter_700Bold',
        letterSpacing: 1.2,
        marginBottom: 10,
    },
    partyCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        backgroundColor: colors.bg,
        borderRadius: radii.md,
        padding: 10,
        borderWidth: 1,
        borderColor: colors.glassBorder,
    },
    partyDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: colors.primary,
    },
    partyName: { color: 'white', fontFamily: 'Inter_600SemiBold', fontSize: 12 },
    partySub: { color: colors.text40, fontSize: 10, fontFamily: 'Inter_400Regular', marginTop: 1 },
    fabArea: {
        position: 'absolute',
        bottom: 14,
        right: 14,
        alignItems: 'center',
    },
    fabWrap: {
        width: 42,
        height: 42,
        alignItems: 'center',
        justifyContent: 'center',
    },
    fabGlow: {
        position: 'absolute',
        top: -7,
        left: -7,
        width: 56,
        height: 56,
        borderRadius: 28,
        borderWidth: 2,
        borderColor: '#6C3EF4',
    },
    fab: {
        width: 42,
        height: 42,
        borderRadius: 21,
        alignItems: 'center',
        justifyContent: 'center',
    },
});
