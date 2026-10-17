import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Image, ScrollView, Dimensions } from 'react-native';
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
import { Sparkles, Calendar, ArrowRight, MapPin, Star } from '../components/icons';
import GradientButton from '../components/GradientButton';
import AvatarBubble from '../components/AvatarBubble';
import UserProfileSheet from '../components/UserProfileSheet';
import { api, photoUri } from '../services/api';
import { errorText, showError } from '../components/dialogs';
import { useReducedMotion } from '../components/kit';
import { radii, motion } from '../theme';
import type { AppColors, ColorRoles } from '../theme';
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
    const { colors, roles } = useTheme();
    const styles = useMemo(() => makeStyles(colors, roles), [colors, roles]);

    const [venue, setVenue] = useState<any>(null);
    const [venueLoaded, setVenueLoaded] = useState(false);
    const [showConfetti, setShowConfetti] = useState(true);
    const [crew, setCrew] = useState<Array<{ id: string; name: string; color?: string; avatarUrl?: string }>>([]);
    const [profileUserId, setProfileUserId] = useState<string | null>(null);
    const [myId, setMyId] = useState<string | null>(null);
    const [keepLoading, setKeepLoading] = useState(false);

    const sparkleRotate = useSharedValue(0);
    const sparkleScale = useSharedValue(0.6);
    const reduced = useReducedMotion();

    useEffect(() => {
        sparkleScale.value = withSpring(1, { damping: 12, stiffness: 180 });
        sparkleRotate.value = withRepeat(
            withSequence(
                withTiming(10, { duration: motion.fast }),
                withTiming(-10, { duration: motion.fast }),
                withTiming(0, { duration: motion.fast })
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
        transform: [{ scale: sparkleScale.value }, { rotate: `${sparkleRotate.value}deg` }],
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
            showError("Couldn't keep swiping", errorText(e, 'Your Link is still here. Try again in a moment.'));
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
            <View style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]} pointerEvents="none">
                {!reduced && <GlowOrb color={roles.primaryBorder} top={height * 0.15} left={width * 0.15} size={280} />}
                {!reduced && <GlowOrb color={roles.accentSoft} top={height * 0.40} left={width * 0.35} size={240} delay={800} />}
                {showConfetti && !reduced && Array.from({ length: CONFETTI_COUNT }).map((_, i) => <ConfettiParticle key={i} index={i} />)}
            </View>

            <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
                <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 32 }} showsVerticalScrollIndicator={false}>
                    <Animated.View entering={FadeInDown.duration(motion.base)} style={{ alignItems: 'center', marginBottom: 24 }}>
                        <Animated.View style={[styles.sparkleBadge, sparkleStyle]}>
                            <LinearGradient
                                colors={colors.gradient as any}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={styles.sparkleBadgeBg}
                            >
                                <Sparkles size={40} color={roles.onPrimary} />
                            </LinearGradient>
                        </Animated.View>
                        <Text style={styles.title}>IT'S A LINK! 🎉</Text>
                        <Text style={styles.subtitle}>Your whole crew wants to go!</Text>
                    </Animated.View>

                    <Animated.View entering={FadeInDown.delay(motion.instant).duration(motion.base)} style={[styles.venueCard, styles.opaque]}>
                        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.glass }]} />
                        <View style={styles.venueImageWrap}>
                            {venue.photo_url ? (
                                <Image source={{ uri: photoUri(venue.photo_url) }} style={styles.venueImage} accessibilityLabel={venue.name} accessibilityRole="image" />
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

                    <Animated.View entering={FadeInDown.delay(motion.fast).duration(motion.base)} style={{ marginTop: 'auto' }}>
                        <GradientButton
                            title="Set the Date"
                            onPress={handleSetDate}
                            leftIcon={<Calendar size={22} color={roles.onPrimary} />}
                            rightIcon={<ArrowRight size={20} color={roles.onPrimary} />}
                        />
                        <View style={{ height: 12 }} />
                        <View style={[styles.opaque, { borderRadius: radii.lg }]}>
                            <GradientButton
                                title="Keep Swiping"
                                variant="ghost"
                                onPress={handleKeepSwiping}
                                loading={keepLoading}
                            />
                        </View>
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

function makeStyles(c: AppColors, r: ColorRoles) {
    return StyleSheet.create({
        root: { flex: 1, backgroundColor: c.bg },
        opaque: { backgroundColor: c.bg },

        sparkleBadge: { marginBottom: 16 },
        sparkleBadgeBg: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center' },
        title: { color: c.textPrimary, fontFamily: 'Inter_900Black', fontSize: 42, marginBottom: 8, textAlign: 'center' },
        subtitle: { color: c.text80, fontSize: 18, fontFamily: 'Inter_500Medium' },

        venueCard: {
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
            paddingVertical: 8,
            borderRadius: radii.pill,
            backgroundColor: r.scrim,
        },
        venueCategoryText: { color: r.onMedia, fontSize: 13, fontFamily: 'Inter_700Bold' },

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
