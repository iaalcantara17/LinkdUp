import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Image, ScrollView, Dimensions, Alert } from 'react-native';
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
import AvatarBubble from '../components/AvatarBubble';
import UserProfileSheet from '../components/UserProfileSheet';
import { api } from '../services/api';
import { radii } from '../theme';
import type { AppColors } from '../theme';
import { useTheme } from '../context/ThemeContext';

const { width, height } = Dimensions.get('window');
const CONFETTI_COUNT = 30;

function ConfettiParticle({ index }: { index: number }) {
    const { colors: themeColors } = useTheme();
    const startX = Math.random() * width;
    const color = themeColors.confetti[index % themeColors.confetti.length];
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

export default function MatchScreen() {
    const nav = useNavigation<any>();
    const route = useRoute<any>();
    const partyId: string = route.params?.partyId ?? 'demo';
    const { colors } = useTheme();
    const styles = useMemo(() => makeStyles(colors), [colors]);

    const [venue, setVenue] = useState<any>(null);
    const [venueLoaded, setVenueLoaded] = useState(false);
    const [showConfetti, setShowConfetti] = useState(true);
    const [crew, setCrew] = useState<Array<{ id: string; name: string; color?: string; avatarUrl?: string }>>([]);
    const [profileUserId, setProfileUserId] = useState<string | null>(null);
    const [myId, setMyId] = useState<string | null>(null);
    const [keepLoading, setKeepLoading] = useState(false);

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

        api.getMatch(partyId).then((data) => {
            if (data?.location) {
                setVenue(data.location);
            }
            setVenueLoaded(true);
        }).catch(() => {
            setVenueLoaded(true);
        });

        Promise.all([api.getMembers(partyId).catch(() => []), api.me().catch(() => null)]).then(
            ([members, me]) => {
                if (me?.id) setMyId(me.id);
                if (Array.isArray(members) && members.length > 0) {
                    setCrew(
                        members.map((m: any) => ({
                            id: m.user_id,
                            name: m.user_id === me?.id ? 'You' : (m.users?.display_name ?? '?'),
                            color: m.users?.avatar_color,
                            avatarUrl: m.users?.avatar_url ?? undefined,
                        }))
                    );
                }
            }
        );

        return () => clearTimeout(t);
    }, [partyId]);

    const sparkleStyle = useAnimatedStyle(() => ({
        transform: [{ rotate: `${sparkleRotate.value}deg` }],
    }));

    const handleSetDate = () => {
        api.generateDates(partyId).catch(() => {});
        nav.replace('DateTimeSetup', { partyId });
    };

    const handleKeepSwiping = async () => {
        setKeepLoading(true);
        try {
            await api.resetParty(partyId);
            nav.replace('Swipe', { partyId });
        } catch (e: any) {
            Alert.alert('Could not reset', e?.message ?? 'Unknown error');
        } finally {
            setKeepLoading(false);
        }
    };

    if (!venueLoaded) {
        return (
            <View style={[styles.root, { alignItems: 'center', justifyContent: 'center' }]}>
                <Text style={{ color: colors.text60, fontFamily: 'Inter_500Medium' }}>Loading your match...</Text>
            </View>
        );
    }

    if (!venue) {
        return (
            <SafeAreaView style={[styles.root, { alignItems: 'center', justifyContent: 'center', padding: 24 }]} edges={['top', 'bottom']}>
                <Text style={{ color: colors.textPrimary, fontFamily: 'Inter_700Bold', fontSize: 18, textAlign: 'center', marginBottom: 24 }}>
                    Could not load match details.
                </Text>
                <GradientButton title="Go Back" variant="ghost" onPress={() => nav.goBack()} />
            </SafeAreaView>
        );
    }

    return (
        <View style={styles.root}>
            <GlowOrb color="rgba(108,62,244,0.4)" top={height * 0.15} left={width * 0.15} size={280} />
            <GlowOrb color="rgba(0,194,255,0.4)" top={height * 0.40} left={width * 0.35} size={240} delay={800} />

            {showConfetti && (
                <View style={StyleSheet.absoluteFill} pointerEvents="none">
                    {Array.from({ length: CONFETTI_COUNT }).map((_, i) => (
                        <ConfettiParticle key={i} index={i} />
                    ))}
                </View>
            )}

            <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
                <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 32 }} showsVerticalScrollIndicator={false}>
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

                    <Animated.View entering={FadeInDown.delay(200).duration(500)} style={styles.venueCard}>
                        <View style={styles.venueImageWrap}>
                            {venue.photo_url ? (
                                <Image source={{ uri: venue.photo_url }} style={styles.venueImage} accessibilityLabel={venue.name} accessibilityRole="image" />
                            ) : (
                                <View style={styles.venueImage} />
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
                                        <MapPin size={16} color={colors.textPrimary} />
                                        <Text style={styles.venueMetaText}>
                                            {venue.distances[0].miles.toFixed(1)} miles
                                        </Text>
                                    </View>
                                )}
                            </View>

                            {venue.address && <Text style={styles.venueAddress}>{venue.address}</Text>}

                            {crew.length > 0 && (
                                <View style={styles.crewSection}>
                                    <Text style={styles.crewSectionLabel}>
                                        {crew.length === 1 ? "You're in!" : "Everyone's in!"}
                                    </Text>
                                    <View style={{ flexDirection: 'row' }}>
                                        {crew.map((m, i) => (
                                            <View key={m.id} style={{ marginLeft: i === 0 ? 0 : -12 }}>
                                                <AvatarBubble
                                                    name={m.name}
                                                    color={m.color}
                                                    avatarUrl={m.avatarUrl}
                                                    size={44}
                                                    onPress={m.id !== myId ? () => setProfileUserId(m.id) : undefined}
                                                />
                                            </View>
                                        ))}
                                    </View>
                                </View>
                            )}
                        </View>
                    </Animated.View>

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
                            onPress={handleKeepSwiping}
                            loading={keepLoading}
                        />
                    </Animated.View>
                </ScrollView>
            </SafeAreaView>

            <UserProfileSheet
                userId={profileUserId}
                visible={profileUserId !== null}
                onClose={() => setProfileUserId(null)}
            />
        </View>
    );
}

function makeStyles(c: AppColors) {
    return StyleSheet.create({
        root: { flex: 1, backgroundColor: c.bg },

        sparkleBadge: { marginBottom: 16 },
        sparkleBadgeBg: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center' },
        title: { color: c.textPrimary, fontFamily: 'Inter_900Black', fontSize: 42, marginBottom: 6, textAlign: 'center' },
        subtitle: { color: c.text80, fontSize: 18, fontFamily: 'Inter_500Medium' },

        venueCard: {
            backgroundColor: c.glass,
            borderRadius: radii.xl,
            borderWidth: 1,
            borderColor: c.glassBorder,
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

        venueName: { color: c.textPrimary, fontFamily: 'Inter_900Black', fontSize: 24, marginBottom: 8 },
        venueMetaRow: { flexDirection: 'row', gap: 16, marginBottom: 8 },
        venueMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
        venueMetaText: { color: c.text80, fontSize: 14, fontFamily: 'Inter_700Bold' },
        venueAddress: { color: c.text60, fontSize: 13, marginBottom: 16, fontFamily: 'Inter_400Regular' },

        crewSection: { borderTopWidth: 1, borderTopColor: c.glassBorder, paddingTop: 12 },
        crewSectionLabel: { color: c.text60, fontSize: 12, marginBottom: 8, fontFamily: 'Inter_400Regular' },
        crewAvatar: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: c.bg },
    });
}
