import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, Dimensions, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useNavigation, useRoute } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    interpolate,
    withSpring,
    withTiming,
    runOnJS,
    Extrapolation,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { X, Heart, MapPin, Info, ArrowLeft, Star } from 'lucide-react-native';
import { api } from '../services/api';
import { colors, typography, spacing, radii } from '../theme';

const { width, height } = Dimensions.get('window');
const SWIPE_THRESHOLD = width * 0.25;

interface Venue {
    id: string;
    name: string;
    category: string | null;
    address: string | null;
    photo_url: string | null;
    rating: number | null;
    distances?: Array<{ user_id: string; display_name: string; miles: number }>;
}

interface CrewMember {
    user_id: string;
    display_name: string;
    status: 'waiting' | 'liked' | 'passed' | 'active';
    avatar_color?: string;
}

// Fallback demo data - used when API fails so the demo always works
const DEMO_VENUES: Venue[] = [
    {
        id: 'demo-1',
        name: 'The Urban Kitchen',
        category: '🍕 Food',
        address: '123 Main St',
        photo_url: 'https://images.unsplash.com/photo-1685040235380-a42a129ade4e?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080',
        rating: 4.5,
        distances: [{ user_id: '1', display_name: 'You', miles: 3.2 }],
    },
    {
        id: 'demo-2',
        name: 'Cozy Corner Cafe',
        category: '☕ Coffee',
        address: '45 Park Ave',
        photo_url: 'https://images.unsplash.com/photo-1643944460517-58de76929473?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080',
        rating: 4.7,
        distances: [{ user_id: '1', display_name: 'You', miles: 2.8 }],
    },
    {
        id: 'demo-3',
        name: 'Strike Zone Bowling',
        category: '🎳 Activity',
        address: '789 Game St',
        photo_url: 'https://images.unsplash.com/photo-1763819527177-64808785b6c9?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080',
        rating: 4.3,
        distances: [{ user_id: '1', display_name: 'You', miles: 4.5 }],
    },
];

const DEMO_CREW: CrewMember[] = [
    { user_id: '1', display_name: 'Alex', status: 'liked' },
    { user_id: '2', display_name: 'Jordan', status: 'liked' },
    { user_id: '3', display_name: 'Sam', status: 'waiting' },
    { user_id: '4', display_name: 'You', status: 'active' },
];

const AVATARS = [
    'https://i.pravatar.cc/150?img=1',
    'https://i.pravatar.cc/150?img=2',
    'https://i.pravatar.cc/150?img=3',
    'https://i.pravatar.cc/150?img=11',
];

export default function SwipeScreen() {
    const nav = useNavigation<any>();
    const route = useRoute<any>();
    const partyId: string = route.params?.partyId ?? 'demo';

    const [venues, setVenues] = useState<Venue[]>([]);
    const [crew] = useState<CrewMember[]>(DEMO_CREW);
    const [index, setIndex] = useState(0);
    const [loading, setLoading] = useState(true);

    const translateX = useSharedValue(0);
    const translateY = useSharedValue(0);

    const load = useCallback(async () => {
        try {
            const locs = await api.getLocations(partyId);
            if (Array.isArray(locs) && locs.length > 0) {
                setVenues(locs);
            } else {
                setVenues(DEMO_VENUES);
            }
        } catch {
            setVenues(DEMO_VENUES);
        } finally {
            setLoading(false);
        }
    }, [partyId]);

    useEffect(() => { load(); }, [load]);

    const advance = (liked: boolean) => {
        // Fire the vote async (non-blocking)
        const current = venues[index];
        if (current && !current.id.startsWith('demo-')) {
            api.vote(partyId, current.id, liked).then((r) => {
                if (r?.match?.matched) {
                    nav.replace('Match', { partyId });
                }
            }).catch(() => {});
        }

        if (index + 1 >= venues.length) {
            // End of deck: check for match, otherwise show end state
            api.getMatch(partyId).then((m) => {
                if (m?.matched) nav.replace('Match', { partyId });
                else Alert.alert('All swiped', 'Waiting for the rest of the crew.');
            }).catch(() => {
                // Demo mode: always "match" at end
                if (partyId === 'demo' || partyId.startsWith('party')) {
                    nav.replace('Match', { partyId });
                }
            });
        }
        setIndex((i) => i + 1);
        translateX.value = 0;
        translateY.value = 0;
    };

    const swipeOff = (direction: 'left' | 'right') => {
        const liked = direction === 'right';
        translateX.value = withTiming(direction === 'right' ? width * 1.5 : -width * 1.5, { duration: 250 }, () => {
            runOnJS(advance)(liked);
        });
    };

    const pan = Gesture.Pan()
        .onUpdate((e) => {
            translateX.value = e.translationX;
            translateY.value = e.translationY;
        })
        .onEnd((e) => {
            if (Math.abs(e.translationX) > SWIPE_THRESHOLD) {
                const direction = e.translationX > 0 ? 'right' : 'left';
                const liked = direction === 'right';
                translateX.value = withTiming(
                    direction === 'right' ? width * 1.5 : -width * 1.5,
                    { duration: 250 },
                    () => {
                        runOnJS(advance)(liked);
                    }
                );
            } else {
                translateX.value = withSpring(0);
                translateY.value = withSpring(0);
            }
        });

    const topCardStyle = useAnimatedStyle(() => {
        const rotate = interpolate(translateX.value, [-width, 0, width], [-15, 0, 15], Extrapolation.CLAMP);
        return {
            transform: [{ translateX: translateX.value }, { translateY: translateY.value }, { rotate: `${rotate}deg` }],
        };
    });

    const likeOpacityStyle = useAnimatedStyle(() => ({
        opacity: interpolate(translateX.value, [0, SWIPE_THRESHOLD], [0, 1], Extrapolation.CLAMP),
    }));

    const nopeOpacityStyle = useAnimatedStyle(() => ({
        opacity: interpolate(translateX.value, [-SWIPE_THRESHOLD, 0], [1, 0], Extrapolation.CLAMP),
    }));

    if (loading) {
        return (
            <View style={[styles.root, { alignItems: 'center', justifyContent: 'center' }]}>
                <Text style={{ color: 'white' }}>Loading venues...</Text>
            </View>
        );
    }

    if (index >= venues.length) {
        return (
            <View style={[styles.root, { alignItems: 'center', justifyContent: 'center', padding: 24 }]}>
                <Text style={[typography.h1, { color: 'white', textAlign: 'center' }]}>No more venues!</Text>
                <Text style={[typography.body, { color: colors.text60, textAlign: 'center', marginVertical: 12 }]}>
                    Check back later or go home
                </Text>
                <TouchableOpacity onPress={() => nav.navigate('Home')} activeOpacity={0.85}>
                    <LinearGradient colors={colors.gradient as any} style={{ paddingHorizontal: 32, paddingVertical: 16, borderRadius: radii.lg }}>
                        <Text style={{ color: 'white', fontFamily: 'Inter_700Bold', fontSize: 16 }}>Back to Home</Text>
                    </LinearGradient>
                </TouchableOpacity>
            </View>
        );
    }

    const current = venues[index];
    const next = venues[index + 1];
    const distance = current.distances?.[0]?.miles ?? 3.2;

    return (
        <View style={styles.root}>
            <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
                {/* Top bar */}
                <View style={styles.topBar}>
                    <TouchableOpacity onPress={() => nav.goBack()} style={styles.topIconBtn}>
                        <ArrowLeft size={22} color="white" />
                    </TouchableOpacity>
                    <BlurView intensity={40} tint="dark" style={styles.midpointPill}>
                        <MapPin size={14} color={colors.primary} />
                        <Text style={styles.midpointText}>{distance.toFixed(1)} mi from midpoint</Text>
                    </BlurView>
                    <TouchableOpacity style={styles.topIconBtn}>
                        <Info size={22} color="white" />
                    </TouchableOpacity>
                </View>

                {/* Progress bar */}
                <View style={styles.progressWrap}>
                    <View style={styles.progressTrack}>
                        <LinearGradient
                            colors={colors.gradient as any}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={[styles.progressFill, { width: `${((index + 1) / venues.length) * 100}%` }]}
                        />
                    </View>
                </View>

                {/* Card stack */}
                <View style={styles.cardStackWrap}>
                    {/* Next card (behind) */}
                    {next && (
                        <View style={[styles.card, { transform: [{ scale: 0.95 }], opacity: 0.5 }]}>
                            {next.photo_url && <Image source={{ uri: next.photo_url }} style={StyleSheet.absoluteFillObject} />}
                        </View>
                    )}

                    {/* Top card */}
                    <GestureDetector gesture={pan}>
                        <Animated.View style={[styles.card, topCardStyle]}>
                            {current.photo_url && (
                                <Image source={{ uri: current.photo_url }} style={StyleSheet.absoluteFillObject} />
                            )}

                            {/* LIKE stamp */}
                            <Animated.View style={[styles.stamp, styles.stampLike, likeOpacityStyle]}>
                                <Text style={styles.stampLikeText}>LIKE</Text>
                            </Animated.View>

                            {/* NOPE stamp */}
                            <Animated.View style={[styles.stamp, styles.stampNope, nopeOpacityStyle]}>
                                <Text style={styles.stampNopeText}>NOPE</Text>
                            </Animated.View>

                            {/* Info overlay */}
                            <LinearGradient
                                colors={['transparent', 'rgba(0,0,0,0.95)']}
                                style={styles.cardOverlay}
                            >
                                {current.category && (
                                    <BlurView intensity={40} tint="dark" style={styles.categoryPill}>
                                        <Text style={styles.categoryText}>{current.category}</Text>
                                    </BlurView>
                                )}
                                <Text style={styles.venueName}>{current.name}</Text>
                                <View style={styles.venueMeta}>
                                    {current.rating && (
                                        <View style={styles.metaRow}>
                                            <Star size={14} color={colors.warning} fill={colors.warning} />
                                            <Text style={styles.metaText}>{current.rating}</Text>
                                        </View>
                                    )}
                                    <Text style={styles.metaDot}>•</Text>
                                    <Text style={styles.metaText}>{distance.toFixed(1)} miles away</Text>
                                </View>
                            </LinearGradient>
                        </Animated.View>
                    </GestureDetector>
                </View>

                {/* Crew HUD */}
                <BlurView intensity={40} tint="dark" style={styles.crewHud}>
                    <View style={styles.crewHeader}>
                        <Text style={styles.crewLabel}>Crew votes</Text>
                        <Text style={styles.crewCount}>
                            {crew.filter((c) => c.status === 'liked' || c.status === 'passed').length}/{crew.length} voted
                        </Text>
                    </View>
                    <View style={styles.crewRow}>
                        {crew.map((member, i) => (
                            <View key={member.user_id} style={{ alignItems: 'center' }}>
                                <View>
                                    <Image
                                        source={{ uri: AVATARS[i % AVATARS.length] }}
                                        style={[
                                            styles.crewAvatar,
                                            member.status === 'waiting' && { opacity: 0.4 },
                                        ]}
                                    />
                                    {member.status === 'liked' && (
                                        <View style={styles.crewBadgeLiked}>
                                            <Heart size={10} color="white" fill="white" />
                                        </View>
                                    )}
                                    {member.status === 'active' && (
                                        <View style={styles.crewBadgeActive} />
                                    )}
                                </View>
                                <Text style={styles.crewName}>{member.display_name}</Text>
                            </View>
                        ))}
                    </View>
                </BlurView>

                {/* Action buttons */}
                <View style={styles.actions}>
                    <TouchableOpacity onPress={() => swipeOff('left')} activeOpacity={0.85}>
                        <View style={styles.passBtn}>
                            <X size={32} color={colors.danger} />
                        </View>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => swipeOff('right')} activeOpacity={0.85}>
                        <LinearGradient
                            colors={colors.gradient as any}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.likeBtn}
                        >
                            <Heart size={40} color="white" fill="white" />
                        </LinearGradient>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8 },
    topIconBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(0,0,0,0.4)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    midpointPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: radii.pill,
        overflow: 'hidden',
    },
    midpointText: { color: 'white', fontSize: 13, fontFamily: 'Inter_500Medium' },

    progressWrap: { paddingHorizontal: 24, marginTop: 12 },
    progressTrack: { height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.10)', overflow: 'hidden' },
    progressFill: { height: '100%' },

    cardStackWrap: { flex: 1, paddingHorizontal: 16, paddingVertical: 16 },
    card: {
        ...StyleSheet.absoluteFillObject,
        margin: 16,
        marginTop: 16,
        borderRadius: radii.xl,
        overflow: 'hidden',
        backgroundColor: colors.surface,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 16 },
        shadowOpacity: 0.4,
        shadowRadius: 24,
        elevation: 16,
    },
    cardOverlay: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 24, paddingTop: 80 },
    categoryPill: {
        alignSelf: 'flex-start',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: radii.pill,
        overflow: 'hidden',
        marginBottom: 12,
    },
    categoryText: { color: 'white', fontSize: 12, fontFamily: 'Inter_700Bold' },
    venueName: { color: 'white', fontSize: 28, fontFamily: 'Inter_900Black', marginBottom: 6 },
    venueMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    metaText: { color: 'rgba(255,255,255,0.85)', fontSize: 14, fontFamily: 'Inter_500Medium' },
    metaDot: { color: 'rgba(255,255,255,0.5)' },

    stamp: {
        position: 'absolute',
        top: '30%',
        borderWidth: 4,
        borderRadius: radii.lg,
        paddingHorizontal: 20,
        paddingVertical: 10,
    },
    stampLike: { left: 24, borderColor: colors.success, transform: [{ rotate: '-20deg' }] },
    stampLikeText: { color: colors.success, fontSize: 36, fontFamily: 'Inter_900Black' },
    stampNope: { right: 24, borderColor: colors.danger, transform: [{ rotate: '20deg' }] },
    stampNopeText: { color: colors.danger, fontSize: 36, fontFamily: 'Inter_900Black' },

    crewHud: {
        marginHorizontal: 16,
        marginTop: 8,
        padding: 14,
        borderRadius: radii.lg,
        borderWidth: 1,
        borderColor: colors.glassBorder,
        overflow: 'hidden',
    },
    crewHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
    crewLabel: { color: colors.text60, fontSize: 12, fontFamily: 'Inter_500Medium' },
    crewCount: { color: 'white', fontSize: 12, fontFamily: 'Inter_700Bold' },
    crewRow: { flexDirection: 'row', justifyContent: 'space-around' },
    crewAvatar: { width: 44, height: 44, borderRadius: 22 },
    crewBadgeLiked: {
        position: 'absolute',
        bottom: -2,
        right: -2,
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: colors.success,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: colors.bg,
    },
    crewBadgeActive: {
        position: 'absolute',
        bottom: -2,
        right: -2,
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: colors.primary,
        borderWidth: 2,
        borderColor: colors.bg,
    },
    crewName: { color: colors.text60, fontSize: 10, marginTop: 4, fontFamily: 'Inter_400Regular' },

    actions: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 32,
        paddingVertical: 16,
    },
    passBtn: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderWidth: 2,
        borderColor: colors.danger,
        alignItems: 'center',
        justifyContent: 'center',
    },
    likeBtn: {
        width: 80,
        height: 80,
        borderRadius: 40,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.5,
        shadowRadius: 16,
        elevation: 12,
    },
});
