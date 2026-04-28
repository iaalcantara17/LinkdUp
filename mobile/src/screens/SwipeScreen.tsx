import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, Dimensions, Modal, ActivityIndicator, Platform, Share } from 'react-native';
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
import { X, Heart, MapPin, Info, ArrowLeft, Star, Check } from 'lucide-react-native';
import { api } from '../services/api';
import { supabase } from '../services/supabase';
import HelpButton from '../components/HelpButton';
import FirstVisitHint from '../components/FirstVisitHint';
import AnchoredHint from '../components/AnchoredHint';

const SWIPE_HELP: { title: string; description: string }[] = [
    { title: 'Swipe right / left', description: 'Like or pass on a spot.' },
    { title: 'Why this?', description: 'Get an AI take on any venue.' },
    { title: 'Party info', description: 'Tap the i button to see party details and members.' },
    { title: 'Done (solo only)', description: 'Skip the rest of the deck and match from your likes.' },
];
import AvatarBubble from '../components/AvatarBubble';
import UserProfileSheet from '../components/UserProfileSheet';
import { typography, radii } from '../theme';
import type { AppColors } from '../theme';
import { useTheme } from '../context/ThemeContext';

const { width, height } = Dimensions.get('window');
const SWIPE_THRESHOLD = width * 0.25;

interface Venue {
    id: string;
    name: string;
    category: string | null;
    address: string | null;
    photo_url: string | null;
    rating: number | null;
    user_ratings_total?: number | null;
    google_place_id?: string | null;
    distances?: Array<{ user_id: string; display_name: string; miles: number }>;
}

interface CrewMember {
    user_id: string;
    display_name: string;
    status: 'waiting' | 'liked' | 'passed' | 'active';
    avatar_color?: string;
    avatar_url?: string;
}

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


export default function SwipeScreen() {
    const nav = useNavigation<any>();
    const route = useRoute<any>();
    const partyId: string = route.params?.partyId ?? 'demo';
    const { colors, isDark } = useTheme();
    const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);

    const [venues, setVenues] = useState<Venue[]>([]);
    const [crew, setCrew] = useState<CrewMember[]>([]);
    const [index, setIndex] = useState(0);
    const [loading, setLoading] = useState(true);
    const [noMatch, setNoMatch] = useState(false);
    const [resetting, setResetting] = useState(false);
    const [voteCounts, setVoteCounts] = useState<Record<string, number>>({});
    const [forceMatchModal, setForceMatchModal] = useState(false);
    const [forcingMatch, setForcingMatch] = useState(false);
    const [pulsingUserId, setPulsingUserId] = useState<string | null>(null);
    const pulseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const whyThisRef = useRef<View>(null);
    const donePillRef = useRef<View>(null);

    const myUserIdRef = useRef<string | null>(null);
    const venuesRef   = useRef<Venue[]>([]);
    const crewRef     = useRef<CrewMember[]>([]);
    const [toast, setToast] = useState<string | null>(null);

    const loadingMoreRef = useRef(false);

    const BATCH_SIZE = 15;
    const [batchVoteCount, setBatchVoteCount] = useState(0);
    const [votingCapped, setVotingCapped] = useState(false);
    const [keepSwipingModal, setKeepSwipingModal] = useState(false);
    const totalVotesRef = useRef(0);

    const [profileUserId, setProfileUserId] = useState<string | null>(null);

    const [infoModal, setInfoModal] = useState(false);
    const [partyInfo, setPartyInfo] = useState<any>(null);

    const [pitchModal, setPitchModal] = useState<{
        venueId: string;
        venueName: string;
        photo_url: string | null;
        pitch: string | null;
        loading: boolean;
    } | null>(null);

    const translateX = useSharedValue(0);
    const translateY = useSharedValue(0);

    const load = useCallback(async () => {
        try {
            const isDemo = partyId === 'demo';
            const [locs, members, me, myVotes] = await Promise.all([
                api.getLocations(partyId).catch(() => []),
                api.getMembers(partyId).catch(() => []),
                api.me().catch(() => null),
                isDemo ? Promise.resolve([]) : api.getMyVotes(partyId).catch(() => []),
            ]);

            myUserIdRef.current = me?.id ?? null;

            const nextVenues = Array.isArray(locs) && locs.length > 0
                ? locs
                : isDemo ? DEMO_VENUES : [];
            setVenues(nextVenues);
            venuesRef.current = nextVenues;

            const votedIds = new Set((myVotes as Array<{ location_id: string }>).map((v) => v.location_id));
            const resumeAt = nextVenues.findIndex((v: Venue) => !votedIds.has(v.id));
            setIndex(resumeAt >= 0 ? resumeAt : 0);

            if (Array.isArray(members) && members.length > 0) {
                const realCrew: CrewMember[] = members.map((m: any) => ({
                    user_id: m.user_id,
                    display_name: m.user_id === me?.id ? 'You' : (m.users?.display_name ?? '?'),
                    status: m.user_id === me?.id ? 'active' : 'waiting',
                    avatar_color: m.users?.avatar_color,
                    avatar_url: m.users?.avatar_url ?? undefined,
                }));
                setCrew(realCrew);
                crewRef.current = realCrew;
            } else {
                const fallback: CrewMember[] = [{ user_id: me?.id ?? 'you', display_name: 'You', status: 'active' }];
                setCrew(fallback);
                crewRef.current = fallback;
            }
        } catch {
            setVenues(DEMO_VENUES);
            venuesRef.current = DEMO_VENUES;
            setCrew([{ user_id: 'you', display_name: 'You', status: 'active' }]);
        } finally {
            setLoading(false);
        }
    }, [partyId]);

    useEffect(() => { load(); }, [load]);

    useEffect(() => { venuesRef.current = venues; }, [venues]);
    useEffect(() => { crewRef.current = crew; }, [crew]);

    const showToast = useCallback((msg: string) => {
        setToast(msg);
        setTimeout(() => setToast(null), 2500);
    }, []);

    useEffect(() => {
        if (partyId === 'demo') return;

        const votesChannel = supabase
            .channel(`votes:${partyId}`)
            .on('postgres_changes', {
                event: 'INSERT', schema: 'public', table: 'votes',
                filter: `party_id=eq.${partyId}`,
            }, (payload: any) => {
                const v = payload.new;
                if (!v || v.user_id === myUserIdRef.current) return;

                setCrew((prev) => {
                    const updated = prev.map((m) =>
                        m.user_id === v.user_id
                            ? { ...m, status: (v.vote ? 'liked' : 'passed') as CrewMember['status'] }
                            : m
                    );
                    crewRef.current = updated;
                    return updated;
                });

                if (pulseTimeoutRef.current) clearTimeout(pulseTimeoutRef.current);
                setPulsingUserId(v.user_id);
                pulseTimeoutRef.current = setTimeout(() => setPulsingUserId(null), 400);

                if (v.vote) {
                    setVoteCounts(prev => ({ ...prev, [v.location_id]: (prev[v.location_id] ?? 0) + 1 }));
                }

                const voter = crewRef.current.find((m) => m.user_id === v.user_id);
                const name = voter?.display_name ?? 'Someone';
                if (v.vote) {
                    const venue = venuesRef.current.find((vn) => vn.id === v.location_id);
                    showToast(venue ? `${name} liked ${venue.name}` : `${name} swiped right`);
                }

                api.getMatch(partyId).then((m: any) => {
                    if (m?.matched) nav.replace('Match', { partyId });
                }).catch(() => {});
            })
            .subscribe();

        const membersChannel = supabase
            .channel(`party_members:${partyId}`)
            .on('postgres_changes', {
                event: 'INSERT', schema: 'public', table: 'party_members',
                filter: `party_id=eq.${partyId}`,
            }, (payload: any) => {
                const m = payload.new;
                if (!m || m.user_id === myUserIdRef.current) return;

                api.getMembers(partyId).then((ms: any[]) => {
                    const found = ms.find((mem: any) => mem.user_id === m.user_id);
                    if (!found) return;
                    const name = found.users?.display_name ?? 'Someone';
                    setCrew((prev) => {
                        if (prev.some((c) => c.user_id === m.user_id)) return prev;
                        const updated = [...prev, {
                            user_id: m.user_id,
                            display_name: name,
                            status: 'waiting' as const,
                            avatar_color: found.users?.avatar_color,
                            avatar_url: found.users?.avatar_url ?? undefined,
                        }];
                        crewRef.current = updated;
                        return updated;
                    });
                    showToast(`${name} joined the party`);
                }).catch(() => {});
            })
            .subscribe();

        return () => {
            supabase.removeChannel(votesChannel);
            supabase.removeChannel(membersChannel);
        };
    }, [partyId, showToast, nav]);

    const handleWhyThis = useCallback(async () => {
        const cur = venuesRef.current[index];
        if (!cur || cur.id.startsWith('demo-')) return;
        setPitchModal({
            venueId: cur.id,
            venueName: cur.name,
            photo_url: cur.photo_url ?? null,
            pitch: null,
            loading: true,
        });
        try {
            const { pitch } = await api.getVenuePitch(partyId, cur.id);
            setPitchModal((prev) => prev ? { ...prev, pitch, loading: false } : null);
        } catch {
            setPitchModal(null);
            showToast("Couldn't generate — try again later");
        }
    }, [index, partyId, showToast]);

    const handleForceMatch = useCallback(async () => {
        setForcingMatch(true);
        try {
            const result = await api.forceMatch(partyId);
            setForceMatchModal(false);
            if (result.matched) {
                nav.replace('Match', { partyId });
            } else {
                showToast('Swipe right on at least one spot first.');
            }
        } catch (err: any) {
            showToast(err?.message ?? 'Something went wrong');
        } finally {
            setForcingMatch(false);
        }
    }, [partyId, nav, showToast]);

    const triggerLoadMore = useCallback(() => {
        if (loadingMoreRef.current || partyId === 'demo') return;
        loadingMoreRef.current = true;
        const deckBefore = venuesRef.current.length;
        console.log('[swipe load-more] deck size before:', deckBefore);
        (async () => {
            try {
                const result = await api.loadMoreVenues(partyId);
                console.log('[swipe load-more] api response:', result);
                const locs = await api.getLocations(partyId);
                const existingIds = new Set(venuesRef.current.map((v) => v.id));
                const newVenues = (locs ?? []).filter((l: any) => !existingIds.has(l.id));
                if (newVenues.length > 0) {
                    const updated = [...venuesRef.current, ...newVenues];
                    setVenues(updated);
                    venuesRef.current = updated;
                }
                console.log('[swipe load-more] deck size after:', venuesRef.current.length);
                const count = result?.new_venue_count ?? 0;
                const exhausted = result?.exhausted ?? false;
                if (count > 0) {
                    showToast(`Found ${count} more spot${count === 1 ? '' : 's'} nearby!`);
                } else if (exhausted) {
                    showToast('That\'s all the spots in your area!');
                } else {
                    showToast('No more spots right now — check back later');
                }
            } catch {
                showToast('Could not load more venues');
            } finally {
                loadingMoreRef.current = false;
            }
        })();
    }, [partyId, showToast]);

    const advance = async (liked: boolean) => {
        const current = venues[index];
        if (votingCapped) {
            const remainingAfter = venues.length - (index + 1);
            if (remainingAfter === 0) {
                showToast("That's everyone — checking for a match...");
            }
        }
        const isRealVenue = current && !current.id.startsWith('demo-');
        const isLastCard = index + 1 >= venues.length;

        if (liked && isRealVenue) {
            setVoteCounts(prev => ({ ...prev, [current.id]: (prev[current.id] ?? 0) + 1 }));
        }

        const remaining = venues.length - (index + 1);
        if (remaining <= 3 && !loadingMoreRef.current && !votingCapped) {
            triggerLoadMore();
        }

        totalVotesRef.current += 1;
        const nextBatchCount = batchVoteCount + 1;
        if (!votingCapped && nextBatchCount >= BATCH_SIZE) {
            setKeepSwipingModal(true);
            setBatchVoteCount(0);
        } else {
            setBatchVoteCount(nextBatchCount);
        }

        if (isRealVenue) {
            try {
                const r = await api.vote(partyId, current.id, liked);
                if (r?.match?.matched) {
                    nav.replace('Match', { partyId });
                    return;
                }
            } catch (err: any) {
                console.warn('[swipe] vote failed', err?.message);
            }
        }

        if (isLastCard) {
            try {
                const m = await api.getMatch(partyId);
                if (m?.matched) {
                    nav.replace('Match', { partyId });
                    return;
                }
                setNoMatch(true);
            } catch {
                if (!isRealVenue) nav.replace('Match', { partyId });
            }
        }

        setIndex(index + 1);
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

    const isSolo = crew.length === 1 && partyId !== 'demo';

    if (loading) {
        return (
            <View style={[styles.root, { alignItems: 'center', justifyContent: 'center' }]}>
                <Text style={{ color: colors.textPrimary }}>Loading venues...</Text>
            </View>
        );
    }

    if (venues.length === 0) {
        return (
            <View style={[styles.root, { alignItems: 'center', justifyContent: 'center', padding: 32 }]}>
                <MapPin size={64} color={colors.primary} style={{ marginBottom: 20 }} />
                <Text style={[typography.h1, { color: colors.textPrimary, textAlign: 'center', marginBottom: 12 }]}>
                    No spots in this area yet
                </Text>
                <Text style={[typography.body, { color: colors.text60, textAlign: 'center', marginBottom: 32, lineHeight: 22 }]}>
                    Try expanding your party's search area, or invite more people to pull the midpoint somewhere busier.
                </Text>
                <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => nav.navigate('PartyLobby', { partyId })}
                >
                    <LinearGradient
                        colors={colors.gradient as any}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={{ paddingHorizontal: 36, paddingVertical: 18, borderRadius: radii.lg }}
                    >
                        <Text style={{ color: 'white', fontFamily: 'Inter_700Bold', fontSize: 16 }}>
                            Back to lobby
                        </Text>
                    </LinearGradient>
                </TouchableOpacity>
            </View>
        );
    }

    if (index >= venues.length) {
        if (noMatch) {
            return (
                <View style={[styles.root, { alignItems: 'center', justifyContent: 'center', padding: 32 }]}>
                    <Text style={{ fontSize: 52, marginBottom: 20 }}>🤷</Text>
                    <Text style={[typography.h1, { color: colors.textPrimary, textAlign: 'center', marginBottom: 12 }]}>
                        No match yet
                    </Text>
                    <Text style={[typography.body, { color: colors.text60, textAlign: 'center', marginBottom: 32, lineHeight: 22 }]}>
                        Nobody clicked yes on the same place.{'\n'}Want to reset and try again?
                    </Text>
                    <TouchableOpacity
                        activeOpacity={0.85}
                        disabled={resetting}
                        onPress={async () => {
                            setResetting(true);
                            try {
                                await api.resetParty(partyId);
                                setNoMatch(false);
                                setIndex(0);
                                await load();
                            } catch (err: any) {
                                console.warn('[swipe] reset failed', err?.message);
                            } finally {
                                setResetting(false);
                            }
                        }}
                    >
                        <LinearGradient
                            colors={colors.gradient as any}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={{ paddingHorizontal: 36, paddingVertical: 18, borderRadius: radii.lg, opacity: resetting ? 0.6 : 1 }}
                        >
                            <Text style={{ color: 'white', fontFamily: 'Inter_700Bold', fontSize: 16 }}>
                                {resetting ? 'Resetting…' : 'Reset & Try Again'}
                            </Text>
                        </LinearGradient>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => nav.navigate('Home')} style={{ marginTop: 16, padding: 12 }}>
                        <Text style={{ color: colors.text60, fontFamily: 'Inter_500Medium', fontSize: 14 }}>Back to Home</Text>
                    </TouchableOpacity>
                </View>
            );
        }

        return (
            <View style={[styles.root, { alignItems: 'center', justifyContent: 'center', padding: 24 }]}>
                <Text style={[typography.h1, { color: colors.textPrimary, textAlign: 'center' }]}>No more venues!</Text>
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
            {toast && (
                <View style={styles.toast} pointerEvents="none">
                    <Text style={styles.toastText}>{toast}</Text>
                </View>
            )}

            <Modal
                visible={!!pitchModal}
                transparent
                animationType="slide"
                onRequestClose={() => setPitchModal(null)}
            >
                <View style={styles.pitchOverlay}>
                    <View style={styles.pitchSheet}>
                        <View style={styles.pitchDragBar} />
                        {pitchModal?.photo_url ? (
                            <Image source={{ uri: pitchModal.photo_url }} style={styles.pitchPhoto} />
                        ) : null}
                        <Text style={styles.pitchVenueName}>{pitchModal?.venueName}</Text>
                        {pitchModal?.loading ? (
                            <ActivityIndicator color={colors.primary} style={{ paddingVertical: 32 }} />
                        ) : (
                            <Text style={styles.pitchBody}>{pitchModal?.pitch}</Text>
                        )}
                        <TouchableOpacity
                            onPress={() => setPitchModal(null)}
                            style={styles.pitchDismiss}
                            activeOpacity={0.8}
                        >
                            <Text style={styles.pitchDismissText}>Got it</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
                <View style={styles.topBar}>
                    <TouchableOpacity onPress={() => nav.goBack()} style={styles.topIconBtn}>
                        <ArrowLeft size={22} color="white" />
                    </TouchableOpacity>
                    <BlurView intensity={40} tint="dark" style={styles.midpointPill}>
                        <MapPin size={14} color={colors.primary} />
                        <Text style={styles.midpointText}>{distance.toFixed(1)} mi from midpoint</Text>
                    </BlurView>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <HelpButton items={SWIPE_HELP} />
                        <TouchableOpacity
                            style={styles.topIconBtn}
                            onPress={() => {
                                if (partyId === 'demo') return;
                                api.getParty(partyId).then((d: any) => {
                                    setPartyInfo(d);
                                    setInfoModal(true);
                                }).catch(() => {});
                            }}
                        >
                            <Info size={22} color="white" />
                        </TouchableOpacity>
                        {isSolo && (
                            <View ref={donePillRef}>
                                <TouchableOpacity onPress={() => setForceMatchModal(true)} activeOpacity={0.85}>
                                    <LinearGradient
                                        colors={colors.gradient as any}
                                        start={{ x: 0, y: 0 }}
                                        end={{ x: 1, y: 0 }}
                                        style={styles.donePickPill}
                                    >
                                        <Check size={13} color="white" />
                                        <Text style={styles.donePickText}>Done — pick now</Text>
                                    </LinearGradient>
                                </TouchableOpacity>
                            </View>
                        )}
                    </View>
                </View>

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

                <View style={styles.cardStackWrap}>
                    {next && (
                        <View style={[styles.card, { transform: [{ scale: 0.95 }], opacity: 0.5 }]}>
                            {next.photo_url && <Image source={{ uri: next.photo_url }} style={StyleSheet.absoluteFillObject} />}
                        </View>
                    )}

                    <GestureDetector gesture={pan}>
                        <Animated.View style={[styles.card, topCardStyle]}>
                            {current.photo_url && (
                                <Image source={{ uri: current.photo_url }} style={StyleSheet.absoluteFillObject} />
                            )}

                            {crew.length > 1 && (voteCounts[current.id] ?? 0) > 0 && (
                                <View style={styles.voteCountPill}>
                                    <Text style={styles.voteCountText}>
                                        {voteCounts[current.id]}/{crew.length}
                                    </Text>
                                </View>
                            )}

                            <Animated.View style={[styles.stamp, styles.stampLike, likeOpacityStyle]}>
                                <Text style={styles.stampLikeText}>LIKE</Text>
                            </Animated.View>

                            <Animated.View style={[styles.stamp, styles.stampNope, nopeOpacityStyle]}>
                                <Text style={styles.stampNopeText}>NOPE</Text>
                            </Animated.View>

                            <LinearGradient
                                colors={['transparent', 'rgba(0,0,0,0.95)']}
                                style={styles.cardOverlay}
                            >
                                {current.category && (
                                    <BlurView intensity={40} tint="dark" style={styles.categoryPill}>
                                        <Text style={styles.categoryText}>{current.category}</Text>
                                    </BlurView>
                                )}
                                <View style={styles.venueRow}>
                                    <Text style={[styles.venueName, { flex: 1 }]}>{current.name}</Text>
                                    {!current.id.startsWith('demo-') && (
                                        <View ref={whyThisRef}>
                                            <TouchableOpacity
                                                onPress={handleWhyThis}
                                                activeOpacity={0.85}
                                                style={styles.whyChip}
                                            >
                                                <Text style={styles.whyChipText}>✨ Why this?</Text>
                                            </TouchableOpacity>
                                        </View>
                                    )}
                                </View>
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

                <BlurView intensity={40} tint={isDark ? 'dark' : 'light'} style={styles.crewHud}>
                    <View style={styles.crewHeader}>
                        <Text style={styles.crewLabel}>Crew</Text>
                        <Text style={styles.crewCount}>
                            {crew.filter((c) => c.status === 'liked' || c.status === 'passed').length}/{crew.length} voted
                        </Text>
                    </View>
                    <View style={styles.crewRow}>
                        {crew.map((member) => (
                            <View key={member.user_id} style={{ alignItems: 'center' }}>
                                <View style={{ opacity: member.status === 'waiting' ? 0.4 : 1 }}>
                                    <AvatarBubble
                                        name={member.display_name}
                                        color={member.avatar_color}
                                        avatarUrl={member.avatar_url}
                                        size={44}
                                        pulse={member.user_id === pulsingUserId}
                                        onPress={member.user_id !== myUserIdRef.current
                                            ? () => setProfileUserId(member.user_id)
                                            : undefined}
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

                {Platform.OS !== 'web' ? (
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
                ) : (
                    <View style={styles.webActions}>
                        <TouchableOpacity onPress={() => swipeOff('left')} activeOpacity={0.85} style={styles.webPassBtn}>
                            <X size={26} color={colors.danger} />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => swipeOff('right')} activeOpacity={0.85}>
                            <LinearGradient
                                colors={colors.gradient as any}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={styles.webLikeBtn}
                            >
                                <Heart size={26} color="white" fill="white" />
                            </LinearGradient>
                        </TouchableOpacity>
                    </View>
                )}
            </SafeAreaView>

            <AnchoredHint
                screenKey="swipe_why_this"
                title="Curious about a spot?"
                body="Tap '✨ Why this?' on any card for an instant AI take on what the place is good for."
                targetRef={whyThisRef}
                placement="top"
            />
            {isSolo && (
                <AnchoredHint
                    screenKey="swipe_done_button"
                    title="Done swiping?"
                    body="Tap 'Done — pick now' to lock in the spot you liked most. Great for when you've seen enough."
                    targetRef={donePillRef}
                    placement="bottom"
                />
            )}

            <UserProfileSheet
                userId={profileUserId}
                visible={profileUserId !== null}
                onClose={() => setProfileUserId(null)}
            />

            <Modal
                visible={infoModal}
                transparent
                animationType="slide"
                onRequestClose={() => setInfoModal(false)}
            >
                <View style={styles.pitchOverlay}>
                    <View style={styles.pitchSheet}>
                        <View style={styles.pitchDragBar} />
                        <Text style={styles.pitchVenueName}>
                            {partyInfo?.party?.name ?? 'Party Info'}
                        </Text>

                        <View style={{ gap: 12, marginTop: 4 }}>
                            <TouchableOpacity
                                activeOpacity={0.85}
                                onPress={() => {
                                    const code = partyInfo?.party?.code;
                                    if (!code) return;
                                    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && (navigator as any).clipboard?.writeText) {
                                        (navigator as any).clipboard.writeText(code);
                                        showToast('Code copied');
                                        return;
                                    }
                                    Share.share({ message: `LinkdUp party code: ${code}` }).catch(() => {});
                                }}
                            >
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Text style={styles.pitchBody}>Party code (tap to copy / share)</Text>
                                    <Text style={{ color: colors.primary, fontFamily: 'Inter_700Bold', fontSize: 18, letterSpacing: 3 }}>
                                        {partyInfo?.party?.code ?? '—'}
                                    </Text>
                                </View>
                            </TouchableOpacity>

                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
                                {(partyInfo?.members ?? []).map((m: any) => (
                                    <View key={m.user_id} style={{ alignItems: 'center' }}>
                                        <AvatarBubble
                                            name={m.users?.display_name ?? '?'}
                                            color={m.users?.avatar_color}
                                            avatarUrl={m.users?.avatar_url}
                                            size={40}
                                        />
                                        <Text style={{ color: colors.text60, fontSize: 10, marginTop: 4, maxWidth: 56 }} numberOfLines={1}>
                                            {m.users?.display_name ?? ''}
                                        </Text>
                                    </View>
                                ))}
                            </View>

                            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                <Text style={styles.pitchBody}>Members</Text>
                                <Text style={{ color: colors.textPrimary, fontFamily: 'Inter_600SemiBold', fontSize: 15 }}>
                                    {partyInfo?.members?.length ?? 0}
                                </Text>
                            </View>

                            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                <Text style={styles.pitchBody}>Venues in deck / voted</Text>
                                <Text style={{ color: colors.textPrimary, fontFamily: 'Inter_600SemiBold', fontSize: 15 }}>
                                    {venues.length} / {crew.filter((c) => c.status === 'liked' || c.status === 'passed').length}
                                </Text>
                            </View>

                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <Text style={styles.pitchBody}>Search radius</Text>
                                <Text style={{ color: colors.text60, fontFamily: 'Inter_400Regular', fontSize: 12, flex: 1, textAlign: 'right', marginLeft: 12 }}>
                                    Google Places near the crew midpoint; load-more expands ~3 km per category pass (cap ~25 km).
                                </Text>
                            </View>

                            {partyInfo?.party?.midpoint_lat && (
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                    <Text style={styles.pitchBody}>Midpoint</Text>
                                    <Text style={{ color: colors.text60, fontFamily: 'Inter_400Regular', fontSize: 13 }}>
                                        {partyInfo.party.midpoint_lat.toFixed(4)}, {partyInfo.party.midpoint_lng.toFixed(4)}
                                    </Text>
                                </View>
                            )}

                            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                <Text style={styles.pitchBody}>Status</Text>
                                <Text style={{ color: colors.success, fontFamily: 'Inter_600SemiBold', fontSize: 14, textTransform: 'uppercase' }}>
                                    {partyInfo?.party?.status ?? '—'}
                                </Text>
                            </View>
                        </View>

                        <TouchableOpacity
                            onPress={() => setInfoModal(false)}
                            style={[styles.pitchDismiss, { marginTop: 24 }]}
                            activeOpacity={0.8}
                        >
                            <Text style={styles.pitchDismissText}>Close</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            <Modal
                visible={forceMatchModal}
                transparent
                animationType="slide"
                onRequestClose={() => setForceMatchModal(false)}
            >
                <View style={styles.pitchOverlay}>
                    <View style={styles.pitchSheet}>
                        <View style={styles.pitchDragBar} />
                        <Text style={styles.pitchVenueName}>Match from your likes so far?</Text>
                        <Text style={styles.pitchBody}>
                            We'll pick the venue you liked most recently.
                        </Text>
                        <TouchableOpacity
                            onPress={handleForceMatch}
                            style={[styles.pitchDismiss, { marginBottom: 10, opacity: forcingMatch ? 0.6 : 1 }]}
                            activeOpacity={0.85}
                            disabled={forcingMatch}
                        >
                            <Text style={styles.pitchDismissText}>
                                {forcingMatch ? 'Picking...' : 'Yes, pick one'}
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={() => setForceMatchModal(false)}
                            style={{
                                backgroundColor: 'transparent',
                                borderWidth: 1,
                                borderColor: colors.glassBorder,
                                borderRadius: radii.md,
                                paddingVertical: 12,
                                alignItems: 'center',
                            }}
                            activeOpacity={0.85}
                        >
                            <Text style={{ color: colors.text80, fontFamily: 'Inter_700Bold', fontSize: 15 }}>
                                Nope, keep swiping
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            <Modal
                visible={keepSwipingModal}
                transparent
                animationType="slide"
                onRequestClose={() => setKeepSwipingModal(false)}
            >
                <View style={styles.pitchOverlay}>
                    <View style={styles.pitchSheet}>
                        <View style={styles.pitchDragBar} />
                        <Text style={styles.pitchVenueName}>
                            Nice work — {totalVotesRef.current} spots rated 👀
                        </Text>
                        <Text style={styles.pitchBody}>
                            Want to keep seeing more spots, or ready to let the crew lock it in based on what you've voted on?
                        </Text>
                        <TouchableOpacity
                            onPress={() => {
                                setKeepSwipingModal(false);
                            }}
                            style={[styles.pitchDismiss, { marginBottom: 10 }]}
                            activeOpacity={0.85}
                        >
                            <Text style={styles.pitchDismissText}>Show me more</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={() => {
                                setVotingCapped(true);
                                setKeepSwipingModal(false);
                                showToast("OK — finish voting on what's left to match.");
                            }}
                            style={{
                                backgroundColor: 'transparent',
                                borderWidth: 1,
                                borderColor: colors.glassBorder,
                                borderRadius: radii.md,
                                paddingVertical: 12,
                                alignItems: 'center',
                            }}
                            activeOpacity={0.85}
                        >
                            <Text style={{ color: colors.text80, fontFamily: 'Inter_700Bold', fontSize: 15 }}>
                                I'm done — pick from what we've seen
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

function makeStyles(c: AppColors, dark: boolean) {
    return StyleSheet.create({
        root: { flex: 1, backgroundColor: c.bg },
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
        progressTrack: {
            height: 4,
            borderRadius: 2,
            backgroundColor: dark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)',
            overflow: 'hidden',
        },
        progressFill: { height: '100%' },

        cardStackWrap: { flex: 1, paddingHorizontal: 16, paddingVertical: 16 },
        card: {
            ...StyleSheet.absoluteFillObject,
            margin: 16,
            marginTop: 16,
            borderRadius: radii.xl,
            overflow: 'hidden',
            backgroundColor: c.surface,
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
        stampLike: { left: 24, borderColor: c.success, transform: [{ rotate: '-20deg' }] },
        stampLikeText: { color: c.success, fontSize: 36, fontFamily: 'Inter_900Black' },
        stampNope: { right: 24, borderColor: c.danger, transform: [{ rotate: '20deg' }] },
        stampNopeText: { color: c.danger, fontSize: 36, fontFamily: 'Inter_900Black' },

        crewHud: {
            marginHorizontal: 16,
            marginTop: 8,
            padding: 14,
            borderRadius: radii.lg,
            borderWidth: 1,
            borderColor: c.glassBorder,
            overflow: 'hidden',
        },
        crewHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
        crewLabel: { color: c.text60, fontSize: 12, fontFamily: 'Inter_500Medium' },
        crewCount: { color: c.textPrimary, fontSize: 12, fontFamily: 'Inter_700Bold' },
        crewRow: { flexDirection: 'row', justifyContent: 'space-around' },
        crewAvatar: { width: 44, height: 44, borderRadius: 22 },
        crewBadgeLiked: {
            position: 'absolute',
            bottom: -2,
            right: -2,
            width: 20,
            height: 20,
            borderRadius: 10,
            backgroundColor: c.success,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 2,
            borderColor: c.bg,
        },
        crewBadgeActive: {
            position: 'absolute',
            bottom: -2,
            right: -2,
            width: 20,
            height: 20,
            borderRadius: 10,
            backgroundColor: c.primary,
            borderWidth: 2,
            borderColor: c.bg,
        },
        crewName: { color: c.text60, fontSize: 10, marginTop: 4, fontFamily: 'Inter_400Regular' },

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
            borderColor: c.danger,
            alignItems: 'center',
            justifyContent: 'center',
        },
        likeBtn: {
            width: 80,
            height: 80,
            borderRadius: 40,
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: c.primary,
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.5,
            shadowRadius: 16,
            elevation: 12,
        },

        donePickPill: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 5,
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: radii.pill,
        },
        donePickText: { color: 'white', fontFamily: 'Inter_700Bold', fontSize: 12 },

        voteCountPill: {
            position: 'absolute',
            top: 16,
            right: 16,
            backgroundColor: 'rgba(34,197,94,0.85)',
            borderRadius: radii.pill,
            paddingHorizontal: 10,
            paddingVertical: 5,
        },
        voteCountText: { color: 'white', fontSize: 12, fontFamily: 'Inter_700Bold' },

        venueRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 6 },
        whyChip: {
            flexShrink: 0,
            backgroundColor: 'rgba(108,62,244,0.75)',
            paddingHorizontal: 10,
            paddingVertical: 5,
            borderRadius: radii.pill,
            marginBottom: 2,
        },
        whyChipText: { color: 'white', fontSize: 11, fontFamily: 'Inter_600SemiBold' },

        webActions: {
            flexDirection: 'row',
            justifyContent: 'center',
            alignItems: 'center',
            gap: 16,
            paddingVertical: 16,
            marginTop: 24,
        },
        webPassBtn: {
            width: 56,
            height: 56,
            borderRadius: 28,
            backgroundColor: 'transparent',
            borderWidth: 2,
            borderColor: c.danger,
            alignItems: 'center',
            justifyContent: 'center',
        },
        webLikeBtn: {
            width: 56,
            height: 56,
            borderRadius: 28,
            alignItems: 'center',
            justifyContent: 'center',
        },

        toast: {
            position: 'absolute',
            top: 60,
            alignSelf: 'center',
            zIndex: 999,
            backgroundColor: 'rgba(20,20,30,0.88)',
            paddingHorizontal: 16,
            paddingVertical: 8,
            borderRadius: radii.pill,
            borderWidth: 1,
            borderColor: c.glassBorder,
        },
        toastText: { color: 'white', fontSize: 13, fontFamily: 'Inter_500Medium' },

        pitchOverlay: {
            flex: 1,
            justifyContent: 'flex-end',
            backgroundColor: 'rgba(0,0,0,0.6)',
        },
        pitchSheet: {
            backgroundColor: c.bg,
            borderTopLeftRadius: radii.xl,
            borderTopRightRadius: radii.xl,
            padding: 24,
            paddingBottom: 40,
            borderWidth: 1,
            borderColor: c.glassBorder,
        },
        pitchDragBar: {
            width: 40,
            height: 4,
            borderRadius: 2,
            backgroundColor: c.text40,
            alignSelf: 'center',
            marginBottom: 20,
        },
        pitchPhoto: {
            width: '100%',
            height: 160,
            borderRadius: radii.md,
            marginBottom: 12,
            resizeMode: 'cover',
        },
        pitchVenueName: {
            color: c.textPrimary,
            fontFamily: 'Inter_700Bold',
            fontSize: 18,
            marginBottom: 14,
        },
        pitchBody: {
            color: c.text80,
            fontSize: 15,
            fontFamily: 'Inter_400Regular',
            lineHeight: 22,
            marginBottom: 24,
        },
        pitchDismiss: {
            backgroundColor: c.primary,
            borderRadius: radii.md,
            paddingVertical: 12,
            alignItems: 'center',
        },
        pitchDismissText: { color: 'white', fontFamily: 'Inter_700Bold', fontSize: 15 },
    });
}
