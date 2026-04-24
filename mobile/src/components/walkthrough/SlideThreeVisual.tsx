import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withRepeat,
    withSequence,
    withTiming,
    Easing,
    cancelAnimation,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, radii } from '../../theme';

const AVATARS = [
    { initial: 'A', color: '#6C3EF4', style: { top: 18, left: 18 } },
    { initial: 'J', color: '#00C2FF', style: { bottom: 18, left: 30 } },
    { initial: 'S', color: '#FF6B9D', style: { top: 50, right: 22 } },
];

export default function SlideThreeVisual() {
    const pinY       = useSharedValue(-32);
    const pinOpacity = useSharedValue(0);
    const ringOpacity = useSharedValue(0);

    useEffect(() => {
        pinY.value = withRepeat(
            withSequence(
                withTiming(-32, { duration: 0 }),
                withTiming(0, { duration: 520, easing: Easing.out(Easing.back(2)) }),
                withTiming(0, { duration: 2480 }),
            ),
            -1,
            false
        );
        pinOpacity.value = withRepeat(
            withSequence(
                withTiming(0, { duration: 0 }),
                withTiming(1, { duration: 280 }),
                withTiming(1, { duration: 2720 }),
            ),
            -1,
            false
        );
        ringOpacity.value = withRepeat(
            withSequence(
                withTiming(0, { duration: 200 }),
                withTiming(0.7, { duration: 500 }),
                withTiming(0.45, { duration: 2300 }),
            ),
            -1,
            false
        );
        return () => {
            cancelAnimation(pinY);
            cancelAnimation(pinOpacity);
            cancelAnimation(ringOpacity);
        };
    }, []);

    const pinStyle  = useAnimatedStyle(() => ({
        transform: [{ translateY: pinY.value }],
        opacity: pinOpacity.value,
    }));
    const ringStyle = useAnimatedStyle(() => ({ opacity: ringOpacity.value }));

    return (
        <View style={styles.map}>
            {[0, 1, 2, 3].map(i => (
                <View key={`h${i}`} style={[styles.gridH, { top: i * 44 }]} />
            ))}
            {[0, 1, 2, 3, 4].map(i => (
                <View key={`v${i}`} style={[styles.gridV, { left: i * 52 }]} />
            ))}

            <Animated.View style={[styles.radiusRing, ringStyle]} />

            <Animated.View style={[styles.pinWrap, pinStyle]}>
                <LinearGradient
                    colors={colors.gradient as any}
                    style={styles.pinDot}
                />
                <View style={styles.pinStem} />
            </Animated.View>

            {AVATARS.map(({ initial, color, style }) => (
                <View key={initial} style={[styles.avatar, { backgroundColor: color, ...style }]}>
                    <Text style={styles.avatarText}>{initial}</Text>
                </View>
            ))}
        </View>
    );
}

const styles = StyleSheet.create({
    map: {
        width: 260,
        height: 175,
        borderRadius: radii.xl,
        backgroundColor: '#0D1117',
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: colors.glassBorder,
    },
    gridH: {
        position: 'absolute',
        left: 0,
        right: 0,
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.04)',
    },
    gridV: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        width: 1,
        backgroundColor: 'rgba(255,255,255,0.04)',
    },
    radiusRing: {
        position: 'absolute',
        width: 110,
        height: 110,
        borderRadius: 55,
        top: 32,
        left: 75,
        borderWidth: 1.5,
        borderColor: 'rgba(108,62,244,0.7)',
        backgroundColor: 'rgba(108,62,244,0.07)',
    },
    pinWrap: {
        position: 'absolute',
        top: 80,
        left: 124,
        alignItems: 'center',
    },
    pinDot: {
        width: 14,
        height: 14,
        borderRadius: 7,
        borderWidth: 2,
        borderColor: 'white',
    },
    pinStem: {
        width: 2,
        height: 7,
        backgroundColor: 'rgba(255,255,255,0.75)',
        marginTop: -1,
    },
    avatar: {
        position: 'absolute',
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: 'white',
    },
    avatarText: { color: 'white', fontFamily: 'Inter_700Bold', fontSize: 11 },
});
