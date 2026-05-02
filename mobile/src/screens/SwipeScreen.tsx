import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, Dimensions, Modal, ActivityIndicator, Platform, Share } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
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
    { title: 'Locked-step', description: 'Everyone sees the same card. The deck advances when all crew members vote.' },
];
import AvatarBubble from '../components/AvatarBubble';
import UserProfileSheet from '../components/UserProfileSheet';
import { typography, radii } from '../theme';
import type { AppColors } from '../theme';
import { useTheme } from '../context/ThemeContext';

const { width } = Dimensions.get('window');
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
    const isDemo = partyId === 'demo';

    const [venues, setVenues] = useState<Venue[]>([]);
    const [crew, setCrew] = useState<CrewMember[]>([]);
    // Server-driven index: the current card all members are on
    const [serverIndex, setServerIndex] = useState(0);
    // For demo/legacy fallback: local index advancement
    const [localIndex, setLocalIndex] = useState(0);
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
    const venuesRef = useRef<Venue[]>([]);
    const crewRef = useRef<CrewMember[]>([]);
    const serverIndexRef = useRef(0);
    const myVotedIdsRef = useRef<Set<string>>(new Set());
    const votingRoundRef = useRef(1);

    const [toast, setToast] = useState<string | null>(null);

    const [profileUserId, setProfileUserId] = useState<string | null>(null);
    const [infoModal, setInfoModal] = useState(false);
    const [partyInfo, setPartyInfo] = useState<any>(null);

    // Server-driven state
    const [votingRound, setVotingRound] = useState(1);
    const [roundStartIndex, setRoundStartIndex] = useState(0);
    const [hasVotedCurrentCard, setHasVotedCurrentCard] = useState(false);
    const [currentCardVoterIds, setCurrentCardVoterIds] = useState<Set<string>>(new Set());

    const [pitchModal, setPitchModal] = useState<{
        venueId: string;
        venueName: string;
        photo_url: string | null;
        pitch: string | null;
        loading: boolean;
    } | null>(null);

    const translateX = useSharedValue(0);
    const translateY = useSharedValue(0);

    // The effective display index: server-driven for real parties, local for demo
    const index = isDemo ? localIndex : serverIndex;

    const load = useCallback(async () => {
        try {
            const [locs, members, me, myVotes, partyData] = await Promise.all([
                api.getLocations(partyId).catch(() => []),
                api.getMembers(partyId).catch(() => []),
                api.me().catch(() => null),
                isDemo ? Promise.resolve([]) : api.getMyVotes(partyId).catch(() => []),
                isDemo ? Promise.resolve(null) : api.getParty(partyId).catch(() => null),
            ]);

            myUserIdRef.current = me?.id ?? null;

            const nextVenues = Array.isArray(locs) && locs.length > 0
                ? locs
                : isDemo ? DEMO_VENUES : [];
            setVenues(nextVenues);
            venuesRef.current = nextVenues;

            const votedIds = new Set((myVotes as Array<{ location_id: string }>).map((v) => v.location_id));
            myVotedIdsRef.current = votedIds;

            if (!isDemo && partyData?.party) {
                const p = partyData.party;
                const sIdx = p.current_card_index ?? 0;
                const round = p.voting_round ?? 1;

                serverIndexRef.current = sIdx;
                votingRoundRef.current = round;
                setServerIndex(sIdx);
                setVotingRound(round);

                const currentVenue = nextVenues[sIdx];
                if (currentVenue) {
                    setHasVotedCurrentCard(votedIds.has(currentVenue.id));
                }

                if (p.status === 'proposing' && p.proposal_location_id) {
                    const memberCount = (members ?? []).length;
                    if (memberCount > 1) {
                        nav.navigate('Proposal', { partyId, locationId: p.proposal_location_id });
                        return;
                    }
                }
                if (p.status === 'matched') {
                    nav.replace('Match', { partyId });
                    return;
                }
            } else if (isDemo) {
                const votedIds2 = new Set((myVotes as Array<{ location_id: string }>).map((v) => v.location_id));
                const resumeAt = nextVenues.findIndex((v: Venue) => !votedIds2.has(v.id));
                setLocalIndex(resumeAt >= 0 ? resumeAt : 0);
            }

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
    }, [partyId, isDemo, nav]);

    useEffect(() => { load(); }, [load]);
    useEffect(() => { venuesRef.current = venues; }, [venues]);
    useEffect(() => { crewRef.current = crew; }, [crew]);

    // Re-sync server state on focus (handles reconnect / back-navigate)
    useFocusEffect(
        useCallback(() => {
            if (isDemo) return;
            api.getParty(partyId).then((d: any) => {
                const p = d?.party;
                if (!p) return;
                const sIdx = p.current_card_index ?? 0;
                const round = p.voting_round ?? 1;

                if (sIdx !== serverIndexRef.current) {
                    serverIndexRef.current = sIdx;
                    const newVenue = venuesRef.current[sIdx];
                    const voted = newVenue ? myVotedIdsRef.current.has(newVenue.id) : false;
                    setHasVotedCurrentCard(voted);
                    setCurrentCardVoterIds(new Set());
                }
                if (round !== votingRoundRef.current) {
                    votingRoundRef.current = round;
                    setRoundStartIndex(sIdx);
                }
                setServerIndex(sIdx);
                setVotingRound(round);

                if (p.status === 'matched') nav.replace('Match', { partyId });
            }).catch(() => {});
        }, [partyId, isDemo, nav])
    );

    const showToast = useCallback((msg: string) => {
        setToast(msg);
        setTimeout(() => setToast(null), 2500);
    }, []);

    // Parties realtime — drives locked-step index
    useEffect(() => {
        if (isDemo) return;

        const partiesChannel = supabase
            .channel(`swipe_parties:${partyId}`)
            .on('postgres_changes', {
                event: 'UPDATE', schema: 'public', table: 'parties',
                filter: `id=eq.${partyId}`,
            }, (payload: any) => {
                const p = payload.new;
                if (!p) return;

                const newIdx: number = p.current_card_index ?? 0;
                const newRound: number = p.voting_round ?? 1;

                if (newIdx !== serverIndexRef.current) {
                    serverIndexRef.current = newIdx;
                    const newVenue = venuesRef.current[newIdx];
                    const voted = newVenue ? myVotedIdsRef.current.has(newVenue.id) : false;
                    setHasVotedCurrentCard(voted);
                    setCurrentCardVoterIds(new Set());
                    translateX.value = 0;
                    translateY.value = 0;
                }
                if (newRound !== votingRoundRef.current) {
                    votingRoundRef.current = newRound;
                    setRoundStartIndex(newIdx);
                }

                setServerIndex(newIdx);
                setVotingRound(newRound);

                if (p.status === 'proposing' && p.proposal_location_id) {
                    const isSolo = crewRef.current.length === 1;
                    if (!isSolo) {
                        nav.navigate('Proposal', { partyId, locationId: p.proposal_location_id });
                    }
                } else if (p.status === 'matched') {
                    nav.replace('Match', { partyId });
                }
            })
            .subscribe();

        return () => { supabase.removeChannel(partiesChannel); };
    }, [partyId, isDemo, nav, translateX, translateY]);

    // Votes + members realtime
    useEffect(() => {
        if (isDemo) return;

        const votesChannel = supabase
            .channel(`votes:${partyId}`)
            .on('postgres_changes', {
                event: 'INSERT', schema: 'public', table: 'votes',
                filter: `party_id=eq.${partyId}`,
            }, (payload: any) => {
                const v = payload.new;
                if (!v || v.user_id === myUserIdRef.current) return;

                // Track per-card votes for waiting overlay
                const currentVenue = venuesRef.current[serverIndexRef.current];
                if (currentVenue && v.location_id === currentVenue.id) {
                    setCurrentCardVoterIds(prev => {
                        const next = new Set(prev);
                        next.add(v.user_id);
                        return next;
                    });
                }

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
                    const voter = crewRef.current.find((m) => m.user_id === v.user_id);
                    const name = voter?.display_name ?? 'Someone';
                    const venue = venuesRef.current.find((vn) => vn.id === v.location_id);
                    showToast(venue ? `${name} liked ${venue.name}` : `${name} swiped right`);
                }
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
    }, [partyId, isDemo, showToast]);

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

    // Unified vote handler — does NOT advance local index for group parties
    const advance = async (liked: boolean) => {
        const current = venues[index];
        const isRealVenue = current && !current.id.startsWith('demo-');

        if (liked && isRealVenue) {
            setVoteCounts(prev => ({ ...prev, [current.id]: (prev[current.id] ?? 0) + 1 }));
        }

        if (isRealVenue) {
            if (!isDemo) {
                // Mark as voted and show waiting overlay; index advances via realtime
                setHasVotedCurrentCard(true);
                myVotedIdsRef.current.add(current.id);
                const myId = myUserIdRef.current;
                if (myId) {
                    setCurrentCardVoterIds(prev => {
                        const next = new Set(prev);
                        next.add(myId);
                        return next;
                    });
                }
            }

            try {
                const r = await api.vote(partyId, current.id, liked);
                // Legacy path: if server returns a direct match, navigate
                if (r?.match?.matched) {
                    nav.replace('Match', { partyId });
                    return;
                }
            } catch (err: any) {
                console.warn('[swipe] vote failed', err?.message);
                if (!isDemo) {
                    setHasVotedCurrentCard(false);
                    myVotedIdsRef.current.delete(current.id);
                    const myId = myUserIdRef.current;
                    if (myId) {
                        setCurrentCardVoterIds(prev => {
                            const next = new Set(prev);
                            next.delete(myId);
                            return next;
                        });
                    }
                }
            }
        }

        // Demo / legacy (local advancement)
        if (isDemo) {
            const isLastCard = localIndex + 1 >= venues.length;
            if (isLastCard) {
                if (!isRealVenue) {
                    nav.replace('Match', { partyId });
                } else {
                    setNoMatch(true);
                }
            }
            setLocalIndex(prev => prev + 1);
            translateX.value = 0;
            translateY.value = 0;
        }
        // For group parties: DO NOT advance local index — wait for server push
    };

    const swipeOff = (direction: 'left' | 'right') => {
        const liked = direction === 'right';
        translateX.value = withTiming(direction === 'right' ? width * 1.5 : -width * 1.5, { duration: 250 }, () => {
            runOnJS(advance)(liked);
        });
    };

    const pan = Gesture.Pan()
        .onUpdate((e) => {
            // Don't allow panning if user already voted on this card
            if (!isDemo && hasVotedCurrentCard) return;
            translateX.value = e.translationX;
            translateY.value = e.translationY;
        })
        .onEnd((e) => {
            if (!isDemo && hasVotedCurrentCard) return;
            if (Math.abs(e.translationX) > SWIPE_THRESHOLD) {
                const direction = e.translationX > 0 ? 'right' : 'left';
                const liked = direction === 'right';
                translateX.value = withTiming(
                    direction === 'right' ? width * 1.5 : -width * 1.5,
                    { duration: 250 },
                    () => { runOnJS(advance)(liked); }
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

    // Progress bar calculation
    const roundSizeTarget = votingRound === 1 ? 10 : 5;
    const withinRoundIdx = Math.max(0, serverIndex - roundStartIndex);
    const progressPercent = isDemo
        ? (localIndex + 1) / Math.max(1, venues.length)
        : Math.min((withinRoundIdx + 1) / roundSizeTarget, 1);
    const progressLabel = isDemo
        ? `${localIndex + 1} / ${venues.length}`
        : `Card ${withinRoundIdx + 1} of ${roundSizeTarget}`;

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
                <TouchableOpacity activeOpacity={0.85} onPress={() => nav.navigate('PartyLobby', { partyId })}>
                    <LinearGradient
                        colors={colors.gradient as any}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={{ paddingHorizontal: 36, paddingVertical: 18, borderRadius: radii.lg }}
                    >
                        <Text style={{ color: 'white', fontFamily: 'Inter_700Bold', fontSize: 16 }}>Back to lobby</Text>
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
                                setServerIndex(0);
                                setLocalIndex(0);
                                serverIndexRef.current = 0;
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

    // Members who have voted on the current card
    const votedOnCurrentCard = new Set([...currentCardVoterIds]);
    if (hasVotedCurrentCard && myUserIdRef.current) {
        votedOnCurrentCard.add(myUserIdRef.current);
    }

    return (
        <View style={styles.root}>
            {toast && (
                <View style={styles.toast} pointerEvents="none">
                    <Text style={styles.toastText}>{toast}</Text>
                </View>
            )}

            {/* AI pitch modal */}
            <Modal visible={!!pitchModal} transparent animationType="slide" onRequestClose={() => setPitchModal(null)}>
                <View style={styles.pitchOverlay}>
                    <View style={styles.pitchSheet}>
                        <View style={styles.pitchDragBar} />
                        {pitchModal?.photo_url ? (
                            <Image source={{ uri: pitchModal.photo_url }} style={styles.pitchPhoto} accessibilityLabel={pitchModal.venueName} accessibilityRole="image" />
                        ) : null}
                        <Text style={styles.pitchVenueName}>{pitchModal?.venueName}</Text>
                        {pitchModal?.loading ? (
                            <ActivityIndicator color={colors.primary} style={{ paddingVertical: 32 }} />
                        ) : (
                            <Text style={styles.pitchBody}>{pitchModal?.pitch}</Text>
                        )}
                        <TouchableOpacity onPress={() => setPitchModal(null)} style={styles.pitchDismiss} activeOpacity={0.8}>
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
                                if (isDemo) return;
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

                {/* Progress bar */}
                <View style={styles.progressWrap}>
                    <View style={styles.progressTrack}>
                        <LinearGradient
                            colors={colors.gradient as any}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={[styles.progressFill, { width: `${progressPercent * 100}%` }]}
                        />
                    </View>
                    {!isDemo && (
                        <Text style={styles.progressLabel}>{progressLabel}</Text>
                    )}
                </View>

                <View style={styles.cardStackWrap}>
                    {next && (
                        <View style={[styles.card, { transform: [{ scale: 0.95 }], opacity: 0.5 }]}>
                            {next.photo_url && <Image source={{ uri: next.photo_url }} style={StyleSheet.absoluteFillObject} accessibilityLabel={next.name} accessibilityRole="image" />}
                        </View>
                    )}

                    <GestureDetector gesture={pan}>
                        <Animated.View style={[styles.card, topCardStyle]}>
                            {current.photo_url && (
                                <Image source={{ uri: current.photo_url }} style={StyleSheet.absoluteFillObject} accessibilityLabel={current.name} accessibilityRole="image" />
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

                            <LinearGradient colors={['transparent', 'rgba(0,0,0,0.95)']} style={styles.cardOverlay}>
                                {current.category && (
                                    <BlurView intensity={40} tint="dark" style={styles.categoryPill}>
                                        <Text style={styles.categoryText}>{current.category}</Text>
                                    </BlurView>
                                )}
                                <View style={styles.venueRow}>
                                    <Text style={[styles.venueName, { flex: 1 }]}>{current.name}</Text>
                                    {!current.id.startsWith('demo-') && (
                                        <View ref={whyThisRef}>
                                            <TouchableOpacity onPress={handleWhyThis} activeOpacity={0.85} style={styles.whyChip}>
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

                            {/* Waiting overlay */}
                            {!isDemo && hasVotedCurrentCard && (
                                <View style={styles.waitingOverlay}>
                                    <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFillObject} />
                                    <View style={styles.waitingContent}>
                                        <Text style={styles.waitingTitle}>Waiting for others...</Text>
                                        <View style={styles.waitingAvatarRow}>
                                            {crew.map((member) => {
                                                const voted = votedOnCurrentCard.has(member.user_id);
                                                return (
                                                    <View key={member.user_id} style={{ alignItems: 'center', marginHorizontal: 6 }}>
                                                        <View style={{ opacity: voted ? 1 : 0.4 }}>
                                                            <AvatarBubble
                                                                name={member.display_name}
                                                                color={member.avatar_color}
                                                                avatarUrl={member.avatar_url}
                                                                size={40}
                                                            />
                                                            {voted && (
                                                                <View style={styles.votedBadge}>
                                                                    <Check size={9} color="white" />
                                                                </View>
                                                            )}
                                                        </View>
                                                        <Text style={styles.waitingMemberName}>{member.display_name}</Text>
                                                    </View>
                                                );
                                            })}
                                        </View>
                                    </View>
                                </View>
                            )}
                        </Animated.View>
                    </GestureDetector>
                </View>

                {/* Crew HUD */}
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
                        <TouchableOpacity
                            onPress={() => { if (!(!isDemo && hasVotedCurrentCard)) swipeOff('left'); }}
                            activeOpacity={(!isDemo && hasVotedCurrentCard) ? 1 : 0.85}
                            style={{ opacity: (!isDemo && hasVotedCurrentCard) ? 0.3 : 1 }}
                        >
                            <View style={styles.passBtn}>
                                <X size={32} color={colors.danger} />
                            </View>
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={() => { if (!(!isDemo && hasVotedCurrentCard)) swipeOff('right'); }}
                            activeOpacity={(!isDemo && hasVotedCurrentCard) ? 1 : 0.85}
                            style={{ opacity: (!isDemo && hasVotedCurrentCard) ? 0.3 : 1 }}
                        >
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
                        <TouchableOpacity
                            onPress={() => { if (!(!isDemo && hasVotedCurrentCard)) swipeOff('left'); }}
                            activeOpacity={(!isDemo && hasVotedCurrentCard) ? 1 : 0.85}
                            style={[styles.webPassBtn, (!isDemo && hasVotedCurrentCard) && { opacity: 0.3 }]}
                        >
                            <X size={26} color={colors.danger} />
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={() => { if (!(!isDemo && hasVotedCurrentCard)) swipeOff('right'); }}
                            activeOpacity={(!isDemo && hasVotedCurrentCard) ? 1 : 0.85}
                            style={[{ opacity: (!isDemo && hasVotedCurrentCard) ? 0.3 : 1 }]}
                        >
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

            {/* Party info modal */}
            <Modal visible={infoModal} transparent animationType="slide" onRequestClose={() => setInfoModal(false)}>
                <View style={styles.pitchOverlay}>
                    <View style={styles.pitchSheet}>
                        <View style={styles.pitchDragBar} />
                        <Text style={styles.pitchVenueName}>{partyInfo?.party?.name ?? 'Party Info'}</Text>
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
                                <Text style={styles.pitchBody}>Round</Text>
                                <Text style={{ color: colors.textPrimary, fontFamily: 'Inter_600SemiBold', fontSize: 15 }}>
                                    {votingRound}
                                </Text>
                            </View>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                <Text style={styles.pitchBody}>Members</Text>
                                <Text style={{ color: colors.textPrimary, fontFamily: 'Inter_600SemiBold', fontSize: 15 }}>
                                    {partyInfo?.members?.length ?? 0}
                                </Text>
                            </View>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                <Text style={styles.pitchBody}>Status</Text>
                                <Text style={{ color: colors.success, fontFamily: 'Inter_600SemiBold', fontSize: 14, textTransform: 'uppercase' }}>
                                    {partyInfo?.party?.status ?? '—'}
                                </Text>
                            </View>
                        </View>
                        <TouchableOpacity onPress={() => setInfoModal(false)} style={[styles.pitchDismiss, { marginTop: 24 }]} activeOpacity={0.8}>
                            <Text style={styles.pitchDismissText}>Close</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* Force match modal (solo) */}
            <Modal visible={forceMatchModal} transparent animationType="slide" onRequestClose={() => setForceMatchModal(false)}>
                <View style={styles.pitchOverlay}>
                    <View style={styles.pitchSheet}>
                        <View style={styles.pitchDragBar} />
                        <Text style={styles.pitchVenueName}>Match from your likes so far?</Text>
                        <Text style={styles.pitchBody}>We'll pick the venue you liked most recently.</Text>
                        <TouchableOpacity
                            onPress={handleForceMatch}
                            style={[styles.pitchDismiss, { marginBottom: 10, opacity: forcingMatch ? 0.6 : 1 }]}
                            activeOpacity={0.85}
                            disabled={forcingMatch}
                        >
                            <Text style={styles.pitchDismissText}>{forcingMatch ? 'Picking...' : 'Yes, pick one'}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={() => setForceMatchModal(false)}
                            style={{ backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.glassBorder, borderRadius: radii.md, paddingVertical: 12, alignItems: 'center' }}
                            activeOpacity={0.85}
                        >
                            <Text style={{ color: colors.text80, fontFamily: 'Inter_700Bold', fontSize: 15 }}>Nope, keep swiping</Text>
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
            width: 40, height: 40, borderRadius: 20,
            backgroundColor: 'rgba(0,0,0,0.4)',
            alignItems: 'center', justifyContent: 'center',
        },
        midpointPill: {
            flexDirection: 'row', alignItems: 'center', gap: 8,
            paddingHorizontal: 14, paddingVertical: 10,
            borderRadius: radii.pill, overflow: 'hidden',
        },
        midpointText: { color: 'white', fontSize: 13, fontFamily: 'Inter_500Medium' },

        progressWrap: { paddingHorizontal: 24, marginTop: 12 },
        progressTrack: {
            height: 4, borderRadius: 2,
            backgroundColor: dark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)',
            overflow: 'hidden',
        },
        progressFill: { height: '100%' },
        progressLabel: {
            color: c.text40,
            fontFamily: 'Inter_400Regular',
            fontSize: 11,
            marginTop: 4,
            textAlign: 'right',
        },

        cardStackWrap: { flex: 1, paddingHorizontal: 16, paddingVertical: 16 },
        card: {
            ...StyleSheet.absoluteFillObject,
            margin: 16, marginTop: 16,
            borderRadius: radii.xl, overflow: 'hidden',
            backgroundColor: c.surface,
            shadowColor: '#000', shadowOffset: { width: 0, height: 16 },
            shadowOpacity: 0.4, shadowRadius: 24, elevation: 16,
        },
        cardOverlay: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 24, paddingTop: 80 },
        categoryPill: {
            alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6,
            borderRadius: radii.pill, overflow: 'hidden', marginBottom: 12,
        },
        categoryText: { color: 'white', fontSize: 12, fontFamily: 'Inter_700Bold' },
        venueName: { color: 'white', fontSize: 28, fontFamily: 'Inter_900Black', marginBottom: 6 },
        venueMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
        metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
        metaText: { color: 'rgba(255,255,255,0.85)', fontSize: 14, fontFamily: 'Inter_500Medium' },
        metaDot: { color: 'rgba(255,255,255,0.5)' },

        stamp: { position: 'absolute', top: '30%', borderWidth: 4, borderRadius: radii.lg, paddingHorizontal: 20, paddingVertical: 10 },
        stampLike: { left: 24, borderColor: c.success, transform: [{ rotate: '-20deg' }] },
        stampLikeText: { color: c.success, fontSize: 36, fontFamily: 'Inter_900Black' },
        stampNope: { right: 24, borderColor: c.danger, transform: [{ rotate: '20deg' }] },
        stampNopeText: { color: c.danger, fontSize: 36, fontFamily: 'Inter_900Black' },

        // Waiting overlay
        waitingOverlay: {
            ...StyleSheet.absoluteFillObject,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: radii.xl,
            overflow: 'hidden',
        },
        waitingContent: {
            alignItems: 'center',
            padding: 24,
            zIndex: 10,
        },
        waitingTitle: {
            color: 'white',
            fontFamily: 'Inter_700Bold',
            fontSize: 18,
            marginBottom: 20,
            textShadowColor: 'rgba(0,0,0,0.8)',
            textShadowOffset: { width: 0, height: 1 },
            textShadowRadius: 4,
        },
        waitingAvatarRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
        waitingMemberName: {
            color: 'rgba(255,255,255,0.8)',
            fontFamily: 'Inter_400Regular',
            fontSize: 10,
            marginTop: 4,
            maxWidth: 48,
            textAlign: 'center',
        },
        votedBadge: {
            position: 'absolute', bottom: -2, right: -2,
            width: 18, height: 18, borderRadius: 9,
            backgroundColor: '#22C55E',
            alignItems: 'center', justifyContent: 'center',
            borderWidth: 2, borderColor: 'rgba(0,0,0,0.6)',
        },

        crewHud: {
            marginHorizontal: 16, marginTop: 8, padding: 14,
            borderRadius: radii.lg, borderWidth: 1, borderColor: c.glassBorder, overflow: 'hidden',
        },
        crewHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
        crewLabel: { color: c.text60, fontSize: 12, fontFamily: 'Inter_500Medium' },
        crewCount: { color: c.textPrimary, fontSize: 12, fontFamily: 'Inter_700Bold' },
        crewRow: { flexDirection: 'row', justifyContent: 'space-around' },
        crewBadgeLiked: {
            position: 'absolute', bottom: -2, right: -2,
            width: 20, height: 20, borderRadius: 10,
            backgroundColor: c.success,
            alignItems: 'center', justifyContent: 'center',
            borderWidth: 2, borderColor: c.bg,
        },
        crewBadgeActive: {
            position: 'absolute', bottom: -2, right: -2,
            width: 20, height: 20, borderRadius: 10,
            backgroundColor: c.primary,
            borderWidth: 2, borderColor: c.bg,
        },
        crewName: { color: c.text60, fontSize: 10, marginTop: 4, fontFamily: 'Inter_400Regular' },

        actions: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 32, paddingVertical: 16 },
        passBtn: {
            width: 64, height: 64, borderRadius: 32,
            backgroundColor: 'rgba(255,255,255,0.08)',
            borderWidth: 2, borderColor: c.danger,
            alignItems: 'center', justifyContent: 'center',
        },
        likeBtn: {
            width: 80, height: 80, borderRadius: 40,
            alignItems: 'center', justifyContent: 'center',
            shadowColor: c.primary, shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.5, shadowRadius: 16, elevation: 12,
        },

        donePickPill: {
            flexDirection: 'row', alignItems: 'center', gap: 5,
            paddingHorizontal: 12, paddingVertical: 8, borderRadius: radii.pill,
        },
        donePickText: { color: 'white', fontFamily: 'Inter_700Bold', fontSize: 12 },

        voteCountPill: {
            position: 'absolute', top: 16, right: 16,
            backgroundColor: 'rgba(34,197,94,0.85)',
            borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 5,
        },
        voteCountText: { color: 'white', fontSize: 12, fontFamily: 'Inter_700Bold' },

        venueRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 6 },
        whyChip: {
            flexShrink: 0, backgroundColor: 'rgba(108,62,244,0.75)',
            paddingHorizontal: 10, paddingVertical: 5,
            borderRadius: radii.pill, marginBottom: 2,
        },
        whyChipText: { color: 'white', fontSize: 11, fontFamily: 'Inter_600SemiBold' },

        webActions: {
            flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
            gap: 16, paddingVertical: 16, marginTop: 24,
        },
        webPassBtn: {
            width: 56, height: 56, borderRadius: 28,
            backgroundColor: 'transparent', borderWidth: 2, borderColor: c.danger,
            alignItems: 'center', justifyContent: 'center',
        },
        webLikeBtn: {
            width: 56, height: 56, borderRadius: 28,
            alignItems: 'center', justifyContent: 'center',
        },

        toast: {
            position: 'absolute', top: 60, alignSelf: 'center', zIndex: 999,
            backgroundColor: 'rgba(20,20,30,0.88)',
            paddingHorizontal: 16, paddingVertical: 8,
            borderRadius: radii.pill, borderWidth: 1, borderColor: c.glassBorder,
        },
        toastText: { color: 'white', fontSize: 13, fontFamily: 'Inter_500Medium' },

        pitchOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
        pitchSheet: {
            backgroundColor: c.bg,
            borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl,
            padding: 24, paddingBottom: 40,
            borderWidth: 1, borderColor: c.glassBorder,
        },
        pitchDragBar: {
            width: 40, height: 4, borderRadius: 2,
            backgroundColor: c.text40, alignSelf: 'center', marginBottom: 20,
        },
        pitchPhoto: { width: '100%', height: 160, borderRadius: radii.md, marginBottom: 12, resizeMode: 'cover' },
        pitchVenueName: { color: c.textPrimary, fontFamily: 'Inter_700Bold', fontSize: 18, marginBottom: 14 },
        pitchBody: { color: c.text80, fontSize: 15, fontFamily: 'Inter_400Regular', lineHeight: 22, marginBottom: 24 },
        pitchDismiss: { backgroundColor: c.primary, borderRadius: radii.md, paddingVertical: 12, alignItems: 'center' },
        pitchDismissText: { color: 'white', fontFamily: 'Inter_700Bold', fontSize: 15 },
    });
}
