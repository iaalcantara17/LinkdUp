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
import { X, Heart } from 'lucide-react-native';
import { colors, radii } from '../../theme';
import Callout from './Callout';

export default function SlideFourVisual() {
    const rotation  = useSharedValue(0);
    const heartGlow = useSharedValue(0.35);

    useEffect(() => {
        rotation.value = withRepeat(
            withSequence(
                withTiming(5,  { duration: 1100 }),
                withTiming(-5, { duration: 1100 }),
                withTiming(0,  { duration: 800 }),
            ),
            -1,
            false
        );
        heartGlow.value = withRepeat(
            withSequence(
                withTiming(0.35, { duration: 900 }),
                withTiming(1.0,  { duration: 600 }),
            ),
            -1,
            false
        );
        return () => {
            cancelAnimation(rotation);
            cancelAnimation(heartGlow);
        };
    }, []);

    const cardStyle  = useAnimatedStyle(() => ({
        transform: [{ rotate: `${rotation.value}deg` }],
    }));
    const glowStyle  = useAnimatedStyle(() => ({ opacity: heartGlow.value }));

    return (
        <View style={styles.root}>
            <Animated.View style={[styles.card, cardStyle]}>
                <LinearGradient
                    colors={colors.gradient as any}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.photo}
                />
                <View style={styles.info}>
                    <Text style={styles.venueName}>Bryant Park Café</Text>
                    <Text style={styles.venueSub}>4.5 ★  ·  1.2 mi</Text>
                </View>
            </Animated.View>

            <View style={styles.buttons}>
                <View style={styles.passBtn}>
                    <X size={20} color={colors.danger} />
                </View>
                <View style={styles.heartWrap}>
                    <Animated.View style={[styles.heartGlow, glowStyle]} />
                    <LinearGradient
                        colors={colors.gradient as any}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.heartBtn}
                    >
                        <Heart size={20} color="white" fill="white" />
                    </LinearGradient>
                </View>
            </View>

            <Callout text="Swipe right to vibe with it →" position="top" />
        </View>
    );
}

const styles = StyleSheet.create({
    root: { alignItems: 'center', gap: 10 },
    card: {
        width: 185,
        height: 145,
        borderRadius: radii.xl,
        overflow: 'hidden',
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.glassBorder,
    },
    photo: { flex: 1 },
    info: { padding: 9 },
    venueName: { color: 'white', fontFamily: 'Inter_700Bold', fontSize: 12 },
    venueSub:  { color: colors.text60, fontFamily: 'Inter_400Regular', fontSize: 10, marginTop: 2 },
    buttons: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 20,
    },
    passBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        borderWidth: 2,
        borderColor: colors.danger,
        backgroundColor: 'rgba(239,68,68,0.10)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    heartWrap: {
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
    },
    heartGlow: {
        position: 'absolute',
        top: -7,
        left: -7,
        width: 54,
        height: 54,
        borderRadius: 27,
        borderWidth: 2,
        borderColor: '#6C3EF4',
    },
    heartBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
});
