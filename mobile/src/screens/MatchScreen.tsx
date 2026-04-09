import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Image, ScrollView, Linking, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useRoute } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withRepeat,
    withSequence,
    withTiming,
    withDelay,
    withSpring,
    Easing,
    FadeInDown,
} from 'react-native-reanimated';
import { Sparkles, Calendar, ArrowRight, MapPin, Star } from 'lucide-react-native';
import GradientButton from '../components/GradientButton';
import { api } from '../services/api';
import { colors, typography, spacing, radii } from '../theme';

const { width, height } = Dimensions.get('window');
const CONFETTI_COUNT = 30; // Lower than Figma's 50 for mobile perf

const DEMO_VENUE = {
    id: 'demo-match',
    name: 'Maple Pool Lounge',
    category: '🎱 Lounge',
    address: '789 Game Street, Midtown',
    rating: 4.9,
    photo_url: null as string | null,
};

// Single confetti particle
function ConfettiParticle({ index }: { index: number }) {
    const startX = Math.random() * width;
    const color = colors.confetti[index % colors.confetti.length];
    const delay = Math.random() * 500;
    const duration = 2000 + Math.random() * 1500;

    const y = useSharedValue(-20);
    const rotate = useSharedValue(0);
    const opacity = useSharedValue(1);

    useEffect(() => {
        y.value = withDelay(delay, withTiming(height + 40, { duration, easing: Easing.in(Easing.quad) }));
        rotate.value = withDelay(delay, withTiming(Math.random() * 720, { duration }));
        opacity.value = withDelay(delay + duration - 400, withTiming(0, { duration: 400 }));
    }, []);

    const style = useAnimatedStyle(() => ({
        transform: [{ translateY: y.value }, { rotate: `${rotate.value}deg` }],
        opacity: opacity.value,
    }));

    return (
        <Animated.View
            style={[
                {
                    position: 'absolute',
                    left: startX,
                    width: 10,
                    height: 10,
                    borderRadius: 5,
                    backgroundColor: color,
                },
                style,
            ]}
        />
    );
}

// Pulsing glow orb
function GlowOrb({
    color,
    top,
    left,
    size,
    delay = 0,
}: {
    color: string;
    top: number;
    left: number;
    size: number;
    delay?: number;
}) {
    const scale = useSharedValue(1);
    const opacity = useSharedValue(0.3);

    useEffect(() => {
        scale.value = withDelay(
            delay,
            withRepeat(
                withSequence(
                    withTiming(1.3, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
                    withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.ease) })
                ),
                -1
            )
        );
        opacity.value = withDelay(
            delay,
            withRepeat(
                withSequence(
                    withTiming(0.5, { duration: 1500 }),
                    withTiming(0.3, { duration: 1500 })
                ),
                -1
            )
        );
    }, []);

    const style = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }],
        opacity: opacity.value,
    }));

    return (
        <Animated.View
            style={[
                {
                    position: 'absolute',
                    top,
                    left,
                    width: size,
                    height: size,
                    borderRadius: size / 2,
                    backgroundColor: color,
                },
                style,
            ]}
        />
    );
}

const CREW_AVATARS = [
    'https://i.pravatar.cc/150?img=1',
    'https://i.pravatar.cc/150?img=2',
    'https://i.pravatar.cc/150?img=3',
    'https://i.pravatar.cc/150?img=11',
];

export default function MatchScreen() {
    const nav = useNavigation<any>();
    const route = useRoute<any>();
    const partyId: string = route.params?.partyId ?? 'demo';
    const [venue, setVenue] = useState<any>(DEMO_VENUE);
    const [showConfetti, setShowConfetti] = useState(true);

    // Sparkle icon rotation
    const sparkleRotate = useSharedValue(0);

    useEffect(() => {
        sparkleRotate.value = withRepeat(
            withSequence(
                withTiming(10, { duration: 250 }),
                withTiming(-10, { duration: 250 }),
                withTiming(0, { duration: 250 })
            ),
            3
        );

        const t = setTimeout(() => setShowConfetti(false), 3500);

        // Try to fetch real match data
        api.getMatch(partyId).then((data) => {
            if (data?.location) setVenue(data.location);
        }).catch(() => {});

        return () => clearTimeout(t);
    }, [partyId]);

    const sparkleStyle = useAnimatedStyle(() => ({
        transform: [{ rotate: `${sparkleRotate.value}deg` }],
    }));

    const handleSetDate = () => {
        api.generateDates(partyId).catch(() => {});
        nav.replace('DateTimeSetup', { partyId });
    };

    return (
        <View style={styles.root}>
            {/* Glow orbs behind everything */}
            <GlowOrb color="rgba(108,62,244,0.4)" top={height * 0.15} left={width * 0.15} size={280} />
            <GlowOrb color="rgba(0,194,255,0.4)" top={height * 0.40} left={width * 0.35} size={240} delay={800} />

            {/* Confetti overlay */}
            {showConfetti && (
                <View style={StyleSheet.absoluteFill} pointerEvents="none">
                    {Array.from({ length: CONFETTI_COUNT }).map((_, i) => (
                        <ConfettiParticle key={i} index={i} />
                    ))}
                </View>
            )}

            <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
                <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 32 }} showsVerticalScrollIndicator={false}>
                    {/* Header */}
                    <Animated.View entering={FadeInDown.duration(500)} style={{ alignItems: 'center', marginBottom: 24 }}>
                        <Animated.View style={[styles.sparkleBadge, sparkleStyle]}>
                            <LinearGradient
                                colors={colors.gradient as any}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={styles.sparkleBadgeBg}
                            >
                                <Sparkles size={40} color="white" />
                            </LinearGradient>
                        </Animated.View>
                        <Text style={styles.title}>IT'S A LINK! 🎉</Text>
                        <Text style={styles.subtitle}>Your whole crew wants to go!</Text>
                    </Animated.View>

                    {/* Venue card */}
                    <Animated.View entering={FadeInDown.delay(200).duration(500)} style={styles.venueCard}>
                        <View style={styles.venueImageWrap}>
                            {venue.photo_url ? (
                                <Image source={{ uri: venue.photo_url }} style={styles.venueImage} />
                            ) : (
                                <Image source={require('../../assets/maple_pool.jpg')} style={styles.venueImage} />
                            )}
                            {venue.category && (
                                <View style={styles.venueCategoryPill}>
                                    <Text style={styles.venueCategoryText}>{venue.category}</Text>
                                </View>
                            )}
                        </View>

                        <View style={{ padding: 20 }}>
                            <Text style={styles.venueName}>{venue.name}</Text>

                            <View style={styles.venueMetaRow}>
                                {venue.rating && (
                                    <View style={styles.venueMetaItem}>
                                        <Star size={16} color={colors.warning} fill={colors.warning} />
                                        <Text style={styles.venueMetaText}>{venue.rating}</Text>
                                    </View>
                                )}
                                {venue.distances?.[0]?.miles && (
                                    <View style={styles.venueMetaItem}>
                                        <MapPin size={16} color="white" />
                                        <Text style={styles.venueMetaText}>
                                            {venue.distances[0].miles.toFixed(1)} miles
                                        </Text>
                                    </View>
                                )}
                            </View>

                            {venue.address && <Text style={styles.venueAddress}>{venue.address}</Text>}

                            <View style={styles.crewSection}>
                                <Text style={styles.crewSectionLabel}>Everyone's in!</Text>
                                <View style={{ flexDirection: 'row' }}>
                                    {CREW_AVATARS.map((a, i) => (
                                        <Image
                                            key={i}
                                            source={{ uri: a }}
                                            style={[styles.crewAvatar, { marginLeft: i === 0 ? 0 : -12 }]}
                                        />
                                    ))}
                                </View>
                            </View>
                        </View>
                    </Animated.View>

                    {/* Actions */}
                    <Animated.View entering={FadeInDown.delay(400).duration(500)} style={{ marginTop: 'auto' }}>
                        <GradientButton
                            title="Set the Date"
                            onPress={handleSetDate}
                            leftIcon={<Calendar size={22} color="white" />}
                            rightIcon={<ArrowRight size={20} color="white" />}
                        />
                        <View style={{ height: 12 }} />
                        <GradientButton
                            title="Keep Swiping"
                            variant="ghost"
                            onPress={() => nav.goBack()}
                        />
                    </Animated.View>
                </ScrollView>
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },

    sparkleBadge: { marginBottom: 16 },
    sparkleBadgeBg: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center' },
    title: { color: 'white', fontFamily: 'Inter_900Black', fontSize: 42, marginBottom: 6, textAlign: 'center' },
    subtitle: { color: 'rgba(255,255,255,0.80)', fontSize: 18, fontFamily: 'Inter_500Medium' },

    venueCard: {
        backgroundColor: colors.glass,
        borderRadius: radii.xl,
        borderWidth: 1,
        borderColor: colors.glassBorder,
        overflow: 'hidden',
        marginBottom: 24,
    },
    venueImageWrap: { height: 192, position: 'relative' },
    venueImage: { width: '100%', height: '100%' },
    venueCategoryPill: {
        position: 'absolute',
        top: 16,
        left: 16,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: radii.pill,
        backgroundColor: 'rgba(0,0,0,0.6)',
    },
    venueCategoryText: { color: 'white', fontSize: 13, fontFamily: 'Inter_700Bold' },

    venueName: { color: 'white', fontFamily: 'Inter_900Black', fontSize: 24, marginBottom: 8 },
    venueMetaRow: { flexDirection: 'row', gap: 16, marginBottom: 8 },
    venueMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    venueMetaText: { color: 'rgba(255,255,255,0.85)', fontSize: 14, fontFamily: 'Inter_700Bold' },
    venueAddress: { color: colors.text60, fontSize: 13, marginBottom: 16, fontFamily: 'Inter_400Regular' },

    crewSection: { borderTopWidth: 1, borderTopColor: colors.glassBorder, paddingTop: 12 },
    crewSectionLabel: { color: colors.text60, fontSize: 12, marginBottom: 8, fontFamily: 'Inter_400Regular' },
    crewAvatar: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: colors.bg },
});
