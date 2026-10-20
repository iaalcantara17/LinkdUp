import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Image, Dimensions, Modal, ActivityIndicator, Platform, Share } from 'react-native';
import { ScreenHeader, Tap, useReducedMotion } from '../components/kit';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { X, Heart, MapPin, Info, Star, Check } from '../components/icons';
import { api, photoUri } from '../services/api';
import { errorText } from '../components/dialogs';
import { LoadError, SlowLoadNote } from '../components/LoadState';
import { cardTilt, deckProgress, sortDeck, stampOpacity, swipeDecision, turnLabel } from '../services/swipeDeck';
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
import { typography, radii, palette, motion } from '../theme';
import type { AppColors, ColorRoles } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';

const { width } = Dimensions.get('window');

interface Venue {
    id: string;
    name: string;
    category: string | null;
    address: string | null;
    photo_url: string | null;
    rating: number | null;
    is_priority?: boolean | null;
    created_at?: string | null;
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
    const { colors, roles, isDark } = useTheme();
    const { isDemo: readOnly } = useAuth();
    const reduced = useReducedMotion();
    const styles = useMemo(() => makeStyles(colors, roles), [colors, roles]);
    const isDemo = partyId === 'demo';

    const [venues, setVenues] = useState<Venue[]>([]);
    const [crew, setCrew] = useState<CrewMember[]>([]);
    // Server-driven index: the current card all members are on
    const [serverIndex, setServerIndex] = useState(0);
    // For demo/legacy fallback: local index advancement
    const [localIndex, setLocalIndex] = useState(0);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<unknown>(null);
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
    const votedCardIndexRef = useRef<number | null>(null);
    const advancedFlashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const [toast, setToast] = useState<string | null>(null);

    const [profileUserId, setProfileUserId] = useState<string | null>(null);
    const [infoModal, setInfoModal] = useState(false);
    const [partyInfo, setPartyInfo] = useState<any>(null);

    // Server-driven state
    const [votingRound, setVotingRound] = useState(1);
    const [hasVotedCurrentCard, setHasVotedCurrentCard] = useState(false);
    const [advancedFlash, setAdvancedFlash] = useState(false);
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

    const setCurrentVoteState = useCallback((voted: boolean, cardIndex = serverIndexRef.current) => {
        setHasVotedCurrentCard(voted);
        votedCardIndexRef.current = voted ? cardIndex : null;
    }, []);

    const showAdvancedFlash = useCallback(() => {
        if (advancedFlashTimeoutRef.current) clearTimeout(advancedFlashTimeoutRef.current);
        setAdvancedFlash(true);
        advancedFlashTimeoutRef.current = setTimeout(() => setAdvancedFlash(false), 900);
    }, []);

    const handedOff = useRef(false);
    const goToProposal = useCallback((locationId: string) => {
        if (handedOff.current) return;
        handedOff.current = true;
        nav.replace('Proposal', { partyId, locationId });
    }, [nav, partyId]);

    const load = useCallback(async () => {
        let locationsError: unknown = null;
        try {
            const [locs, members, me, myVotes, partyData] = await Promise.all([
                api.getLocations(partyId).catch((e) => { locationsError = e; return null; }),
                api.getMembers(partyId).catch(() => null),
                api.me().catch(() => null),
                isDemo ? Promise.resolve([]) : api.getMyVotes(partyId).catch(() => []),
                isDemo ? Promise.resolve(null) : api.getParty(partyId).catch(() => null),
            ]);

            myUserIdRef.current = me?.id ?? null;

            if (locationsError) {
                if (venuesRef.current.length === 0) setLoadError(locationsError);
                return;
            }
            setLoadError(null);

            const nextVenues = Array.isArray(locs) && locs.length > 0
                ? sortDeck(locs as Venue[])
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
                setServerIndex(sIdx);
                setVotingRound(round);

                const currentVenue = nextVenues[sIdx];
                if (currentVenue) {
                    setCurrentVoteState(votedIds.has(currentVenue.id), sIdx);
                }

                if (p.status === 'proposing' && p.proposal_location_id) {
                    goToProposal(p.proposal_location_id);
                    return;
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
            } else if (members !== null) {
                const fallback: CrewMember[] = [{ user_id: me?.id ?? 'you', display_name: 'You', status: 'active' }];
                setCrew(fallback);
                crewRef.current = fallback;
            }
        } catch {
            setVenues(DEMO_VENUES);
            venuesRef.current = DEMO_VENUES;
        } finally {
            setLoading(false);
        }
    }, [partyId, isDemo, nav, setCurrentVoteState, goToProposal]);

    useEffect(() => { load(); }, [load]);

    const retryLoad = useCallback(() => {
        setLoadError(null);
        setLoading(true);
        load();
    }, [load]);
    useEffect(() => {
        translateX.value = 0;
        translateY.value = 0;
    }, [index, translateX, translateY]);
    useEffect(() => {
        if (!isDemo && venues.length > 0 && serverIndex >= venues.length) load();
    }, [isDemo, serverIndex, venues.length, load]);
    useEffect(() => { venuesRef.current = venues; }, [venues]);
    useEffect(() => { crewRef.current = crew; }, [crew]);
    useEffect(() => () => {
        if (advancedFlashTimeoutRef.current) clearTimeout(advancedFlashTimeoutRef.current);
        if (pulseTimeoutRef.current) clearTimeout(pulseTimeoutRef.current);
    }, []);

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
                    setCurrentVoteState(voted, sIdx);
                    setCurrentCardVoterIds(new Set());
                }
                setServerIndex(sIdx);
                setVotingRound(round);

                if (p.status === 'matched') nav.replace('Match', { partyId });
            }).catch(() => {});
        }, [partyId, isDemo, nav, setCurrentVoteState])
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
                    setCurrentVoteState(false, newIdx);
                    setCurrentCardVoterIds(new Set());
                    setCrew(prev => {
                        const updated = prev.map((m) => ({
                            ...m,
                            status: m.user_id === myUserIdRef.current ? 'active' as const : 'waiting' as const,
                        }));
                        crewRef.current = updated;
                        return updated;
                    });
                    showAdvancedFlash();
                }

                setServerIndex(newIdx);
                setVotingRound(newRound);

                if (p.status === 'proposing' && p.proposal_location_id) {
                    goToProposal(p.proposal_location_id);
                } else if (p.status === 'matched') {
                    nav.replace('Match', { partyId });
                }
            })
            .subscribe();

        return () => { supabase.removeChannel(partiesChannel); };
    }, [partyId, isDemo, nav, setCurrentVoteState, showAdvancedFlash, translateX, translateY, goToProposal]);

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
                const isVoteOnCurrentCard = currentVenue && v.location_id === currentVenue.id;
                if (!isVoteOnCurrentCard) return;

                setCurrentCardVoterIds(prev => {
                    const next = new Set(prev);
                    next.add(v.user_id);
                    return next;
                });

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
            setForceMatchModal(false);
            if (err?.message === 'party_not_swiping') load();
            else showToast(errorText(err, "Couldn't pick right now. Try again."));
        } finally {
            setForcingMatch(false);
        }
    }, [partyId, nav, showToast, load]);

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
                setCurrentVoteState(true, serverIndexRef.current);
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
                if (r?.proposing) {
                    load();
                    return;
                }
                if (crewRef.current.length === 1) load();
            } catch (err: any) {
                translateX.value = withTiming(0, { duration: motion.fast });
                translateY.value = withTiming(0, { duration: motion.fast });
                console.warn('[swipe] vote failed', err?.message);
                if (!isDemo) {
                    setCurrentVoteState(false, serverIndexRef.current);
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
        }
        // For group parties: DO NOT advance local index — wait for server push
    };

    const swipeOff = (direction: 'left' | 'right') => {
        const liked = direction === 'right';
        if (reduced) {
            advance(liked);
            return;
        }
        translateX.value = withTiming(direction === 'right' ? width * 1.5 : -width * 1.5, { duration: motion.fast }, () => {
            runOnJS(advance)(liked);
        });
    };

    const buttonsLocked = readOnly || (!isDemo && hasVotedCurrentCard && votedCardIndexRef.current === serverIndex);

    const pan = Gesture.Pan()
        .enabled(!reduced)
        .onUpdate((e) => {
            // Don't allow panning if user already voted on this card
            if (buttonsLocked) return;
            translateX.value = e.translationX;
            translateY.value = e.translationY;
        })
        .onEnd((e) => {
            if (buttonsLocked) return;
            const decision = swipeDecision(e.translationX, width);
            if (decision) {
                const liked = decision === 'like';
                translateX.value = withTiming(
                    liked ? width * 1.5 : -width * 1.5,
                    { duration: motion.fast },
                    () => { runOnJS(advance)(liked); }
                );
            } else {
                translateX.value = withTiming(0, { duration: motion.fast });
                translateY.value = withTiming(0, { duration: motion.fast });
            }
        });

    const topCardStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: translateX.value }, { translateY: translateY.value }, { rotate: `${cardTilt(translateX.value, width)}deg` }],
    }));

    const likeOpacityStyle = useAnimatedStyle(() => ({ opacity: stampOpacity(translateX.value, width).like }));

    const nopeOpacityStyle = useAnimatedStyle(() => ({ opacity: stampOpacity(translateX.value, width).nope }));

    const isSolo = crew.length === 1 && partyId !== 'demo';

    const { label: progressLabel, percent: progressPercent } = deckProgress(index, venues.length);

    if (loading) {
        return (
            <View style={[styles.root, { alignItems: 'center', justifyContent: 'center', padding: 32 }]}>
                <Text style={{ color: colors.textPrimary }}>Loading venues...</Text>
                <SlowLoadNote loading />
            </View>
        );
    }

    if (loadError && venues.length === 0) {
        return (
            <View style={[styles.root, { justifyContent: 'center', padding: 32 }]}>
                <LoadError title="We couldn't load the spots for this party" error={loadError} onRetry={retryLoad} />
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
                <Tap activeOpacity={0.85} onPress={() => nav.navigate('PartyLobby', { partyId })}>
                    <LinearGradient
                        colors={colors.gradient as any}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={{ paddingHorizontal: 36, paddingVertical: 16, borderRadius: radii.lg }}
                    >
                        <Text style={{ color: roles.onPrimary, fontFamily: 'Inter_700Bold', fontSize: 16 }}>Back to lobby</Text>
                    </LinearGradient>
                </Tap>
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
                    <Tap
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
                            style={{ paddingHorizontal: 36, paddingVertical: 16, borderRadius: radii.lg, opacity: resetting ? 0.6 : 1 }}
                        >
                            <Text style={{ color: roles.onPrimary, fontFamily: 'Inter_700Bold', fontSize: 16 }}>
                                {resetting ? 'Resetting…' : 'Reset & Try Again'}
                            </Text>
                        </LinearGradient>
                    </Tap>
                    <Tap onPress={() => nav.navigate('Home')} style={{ marginTop: 16, padding: 12 }}>
                        <Text style={{ color: colors.text60, fontFamily: 'Inter_500Medium', fontSize: 14 }}>Back to Home</Text>
                    </Tap>
                </View>
            );
        }

        return (
            <View style={[styles.root, { alignItems: 'center', justifyContent: 'center', padding: 24 }]}>
                <Text style={[typography.h1, { color: colors.textPrimary, textAlign: 'center' }]}>No more venues!</Text>
                <Text style={[typography.body, { color: colors.text60, textAlign: 'center', marginVertical: 12 }]}>
                    Check back later or go home
                </Text>
                <Tap onPress={() => nav.navigate('Home')} activeOpacity={0.85}>
                    <LinearGradient colors={colors.gradient as any} style={{ paddingHorizontal: 32, paddingVertical: 16, borderRadius: radii.lg }}>
                        <Text style={{ color: roles.onPrimary, fontFamily: 'Inter_700Bold', fontSize: 16 }}>Back to Home</Text>
                    </LinearGradient>
                </Tap>
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
    const waitingNames = crew
        .filter((member) => !votedOnCurrentCard.has(member.user_id))
        .map((member) => member.display_name);
    const turnStatusLabel = turnLabel({ solo: isSolo, locked: buttonsLocked, flash: advancedFlash, waitingNames });

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
                            <Image source={{ uri: photoUri(pitchModal.photo_url) }} style={styles.pitchPhoto} accessibilityLabel={pitchModal.venueName} accessibilityRole="image" />
                        ) : null}
                        <Text style={styles.pitchVenueName}>{pitchModal?.venueName}</Text>
                        {pitchModal?.loading ? (
                            <ActivityIndicator color={colors.primary} style={{ paddingVertical: 32 }} />
                        ) : (
                            <Text style={styles.pitchBody}>{pitchModal?.pitch}</Text>
                        )}
                        <Tap onPress={() => setPitchModal(null)} style={styles.pitchDismiss} activeOpacity={0.8}>
                            <Text style={styles.pitchDismissText}>Got it</Text>
                        </Tap>
                    </View>
                </View>
            </Modal>

            <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
                <ScreenHeader
                    onBack={() => nav.goBack()}
                    title={
                        <BlurView intensity={40} tint="dark" style={styles.midpointPill}>
                            <MapPin size={14} color={colors.primary} />
                            <Text style={styles.midpointText}>{distance.toFixed(1)} mi from midpoint</Text>
                        </BlurView>
                    }
                    right={
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <HelpButton items={SWIPE_HELP} />
                            <Tap
                                style={styles.topIconBtn}
                                onPress={() => {
                                    if (isDemo) return;
                                    api.getParty(partyId).then((d: any) => {
                                        setPartyInfo(d);
                                        setInfoModal(true);
                                    }).catch(() => {});
                                }}
                            >
                                <Info size={22} color={roles.onMedia} />
                            </Tap>
                            {isSolo && (
                                <View ref={donePillRef}>
                                    <Tap onPress={() => setForceMatchModal(true)} activeOpacity={0.85}>
                                        <LinearGradient
                                            colors={colors.gradient as any}
                                            start={{ x: 0, y: 0 }}
                                            end={{ x: 1, y: 0 }}
                                            style={styles.donePickPill}
                                        >
                                            <Check size={13} color={roles.onPrimary} />
                                            <Text style={styles.donePickText}>Done — pick now</Text>
                                        </LinearGradient>
                                    </Tap>
                                </View>
                            )}
                        </View>
                    }
                />

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
                            {next.photo_url && <Image source={{ uri: photoUri(next.photo_url) }} style={StyleSheet.absoluteFillObject} accessibilityLabel={next.name} accessibilityRole="image" />}
                        </View>
                    )}

                    <GestureDetector gesture={pan}>
                        <Animated.View style={[styles.card, topCardStyle]}>
                            {current.photo_url ? (
                                <Image source={{ uri: photoUri(current.photo_url) }} style={StyleSheet.absoluteFillObject} accessibilityLabel={current.name} accessibilityRole="image" />
                            ) : (
                                <LinearGradient
                                    colors={colors.gradient as any}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 1 }}
                                    style={[StyleSheet.absoluteFillObject, { alignItems: 'center', justifyContent: 'center', paddingBottom: 120 }]}
                                >
                                    <MapPin size={64} color={roles.onPrimary} />
                                </LinearGradient>
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

                            <LinearGradient colors={['transparent', roles.scrimStrong]} style={styles.cardOverlay}>
                                {current.category && (
                                    <BlurView intensity={40} tint="dark" style={styles.categoryPill}>
                                        <Text style={styles.categoryText}>{current.category}</Text>
                                    </BlurView>
                                )}
                                <View style={styles.venueRow}>
                                    <Text style={[styles.venueName, { flex: 1 }]}>{current.name}</Text>
                                    {!current.id.startsWith('demo-') && (
                                        <View ref={whyThisRef}>
                                            <Tap onPress={handleWhyThis} activeOpacity={0.85} style={styles.whyChip}>
                                                <Text style={styles.whyChipText}>✨ Why this?</Text>
                                            </Tap>
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
                            {!isDemo && buttonsLocked && !isSolo && (
                                <View style={styles.waitingOverlay}>
                                    <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFillObject} />
                                    <View style={styles.waitingContent}>
                                        <Text style={styles.waitingTitle}>Waiting for others...</Text>
                                        <View style={styles.waitingAvatarRow}>
                                            {crew.map((member) => {
                                                const voted = votedOnCurrentCard.has(member.user_id);
                                                return (
                                                    <View key={member.user_id} style={{ alignItems: 'center', marginHorizontal: 8 }}>
                                                        <View style={{ opacity: voted ? 1 : 0.4 }}>
                                                            <AvatarBubble
                                                                name={member.display_name}
                                                                color={member.avatar_color}
                                                                avatarUrl={member.avatar_url}
                                                                size={40}
                                                            />
                                                            {voted && (
                                                                <View style={styles.votedBadge}>
                                                                    <Check size={9} color={roles.onPrimary} />
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
                                            <Heart size={10} color={roles.onPrimary} fill={roles.onPrimary} />
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

                {!isDemo && (
                    <Text style={styles.turnStatusLabel}>{turnStatusLabel}</Text>
                )}

                {Platform.OS !== 'web' ? (
                    <View style={styles.actions}>
                        <Tap
                            onPress={() => { if (!buttonsLocked) swipeOff('left'); }}
                            accessibilityRole="button"
                            accessibilityLabel={`Skip ${current?.name ?? 'this spot'}`}
                            accessibilityState={{ disabled: buttonsLocked }}
                            disabled={buttonsLocked}
                            activeOpacity={buttonsLocked ? 1 : 0.85}
                            style={{ opacity: buttonsLocked ? 0.3 : 1 }}
                        >
                            <View style={styles.passBtn}>
                                <X size={32} color={colors.danger} />
                            </View>
                        </Tap>
                        <Tap
                            onPress={() => { if (!buttonsLocked) swipeOff('right'); }}
                            accessibilityRole="button"
                            accessibilityLabel={`Like ${current?.name ?? 'this spot'}`}
                            accessibilityState={{ disabled: buttonsLocked }}
                            disabled={buttonsLocked}
                            activeOpacity={buttonsLocked ? 1 : 0.85}
                            style={{ opacity: buttonsLocked ? 0.3 : 1 }}
                        >
                            <LinearGradient
                                colors={colors.gradient as any}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={styles.likeBtn}
                            >
                                <Heart size={40} color={roles.onPrimary} fill={roles.onPrimary} />
                            </LinearGradient>
                        </Tap>
                    </View>
                ) : (
                    <View style={styles.webActions}>
                        <Tap
                            onPress={() => { if (!buttonsLocked) swipeOff('left'); }}
                            accessibilityRole="button"
                            accessibilityLabel={`Skip ${current?.name ?? 'this spot'}`}
                            accessibilityState={{ disabled: buttonsLocked }}
                            disabled={buttonsLocked}
                            activeOpacity={buttonsLocked ? 1 : 0.85}
                            style={[styles.webPassBtn, buttonsLocked && { opacity: 0.3 }]}
                        >
                            <X size={26} color={colors.danger} />
                        </Tap>
                        <Tap
                            onPress={() => { if (!buttonsLocked) swipeOff('right'); }}
                            accessibilityRole="button"
                            accessibilityLabel={`Like ${current?.name ?? 'this spot'}`}
                            accessibilityState={{ disabled: buttonsLocked }}
                            disabled={buttonsLocked}
                            activeOpacity={buttonsLocked ? 1 : 0.85}
                            style={[{ opacity: buttonsLocked ? 0.3 : 1 }]}
                        >
                            <LinearGradient
                                colors={colors.gradient as any}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={styles.webLikeBtn}
                            >
                                <Heart size={26} color={roles.onPrimary} fill={roles.onPrimary} />
                            </LinearGradient>
                        </Tap>
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
                            <Tap
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
                            </Tap>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
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
                        <Tap onPress={() => setInfoModal(false)} style={[styles.pitchDismiss, { marginTop: 24 }]} activeOpacity={0.8}>
                            <Text style={styles.pitchDismissText}>Close</Text>
                        </Tap>
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
                        <Tap
                            onPress={handleForceMatch}
                            style={[styles.pitchDismiss, { marginBottom: 8, opacity: forcingMatch ? 0.6 : 1 }]}
                            activeOpacity={0.85}
                            disabled={forcingMatch}
                        >
                            <Text style={styles.pitchDismissText}>{forcingMatch ? 'Picking...' : 'Yes, pick one'}</Text>
                        </Tap>
                        <Tap
                            onPress={() => setForceMatchModal(false)}
                            style={{ backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.glassBorder, borderRadius: radii.md, paddingVertical: 12, alignItems: 'center' }}
                            activeOpacity={0.85}
                        >
                            <Text style={{ color: colors.text80, fontFamily: 'Inter_700Bold', fontSize: 15 }}>Nope, keep swiping</Text>
                        </Tap>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

function makeStyles(c: AppColors, r: ColorRoles) {
    return StyleSheet.create({
        root: { flex: 1, backgroundColor: c.bg },
        topIconBtn: {
            width: 40, height: 40, borderRadius: 20,
            backgroundColor: r.scrim,
            alignItems: 'center', justifyContent: 'center',
        },
        midpointPill: {
            flexDirection: 'row', alignItems: 'center', gap: 8,
            paddingHorizontal: 16, paddingVertical: 8,
            borderRadius: radii.pill, overflow: 'hidden', backgroundColor: r.scrim,
        },
        midpointText: { color: r.onMedia, fontSize: 13, fontFamily: 'Inter_500Medium' },

        progressWrap: { paddingHorizontal: 24, marginTop: 12 },
        progressTrack: {
            height: 4, borderRadius: 2,
            backgroundColor: r.fillStrong,
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
            shadowColor: palette.black, shadowOffset: { width: 0, height: 16 },
            shadowOpacity: 0.4, shadowRadius: 24, elevation: 16,
        },
        cardOverlay: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 24, paddingTop: 80 },
        categoryPill: {
            alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 8,
            borderRadius: radii.pill, overflow: 'hidden', marginBottom: 12,
        },
        categoryText: { color: r.onMedia, fontSize: 12, fontFamily: 'Inter_700Bold' },
        venueName: { color: r.onMedia, fontSize: 28, fontFamily: 'Inter_900Black', marginBottom: 8 },
        venueMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
        metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
        metaText: { color: r.onMediaMuted, fontSize: 14, fontFamily: 'Inter_500Medium' },
        metaDot: { color: r.onMediaFaint },

        stamp: { position: 'absolute', top: '30%', borderWidth: 4, borderRadius: radii.lg, paddingHorizontal: 20, paddingVertical: 8 },
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
            color: r.onMedia,
            fontFamily: 'Inter_700Bold',
            fontSize: 18,
            marginBottom: 20,
            textShadowColor: r.scrimStrong,
            textShadowOffset: { width: 0, height: 1 },
            textShadowRadius: 4,
        },
        waitingAvatarRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
        waitingMemberName: {
            color: r.onMediaMuted,
            fontFamily: 'Inter_400Regular',
            fontSize: 10,
            marginTop: 4,
            maxWidth: 48,
            textAlign: 'center',
        },
        votedBadge: {
            position: 'absolute', bottom: -2, right: -2,
            width: 18, height: 18, borderRadius: 9,
            backgroundColor: r.successFill,
            alignItems: 'center', justifyContent: 'center',
            borderWidth: 2, borderColor: r.scrim,
        },

        crewHud: {
            marginHorizontal: 16, marginTop: 8, padding: 16,
            borderRadius: radii.lg, borderWidth: 1, borderColor: c.glassBorder, overflow: 'hidden',
        },
        crewHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
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
        turnStatusLabel: {
            color: c.text80,
            fontFamily: 'Inter_600SemiBold',
            fontSize: 13,
            textAlign: 'center',
            marginTop: 8,
            paddingHorizontal: 20,
        },

        actions: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 32, paddingVertical: 16 },
        passBtn: {
            width: 64, height: 64, borderRadius: 32,
            backgroundColor: r.fillStrong,
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
            flexDirection: 'row', alignItems: 'center', gap: 4,
            paddingHorizontal: 12, paddingVertical: 8, borderRadius: radii.pill,
        },
        donePickText: { color: r.onPrimary, fontFamily: 'Inter_700Bold', fontSize: 12 },

        voteCountPill: {
            position: 'absolute', top: 16, right: 16,
            backgroundColor: r.successFill,
            borderRadius: radii.pill, paddingHorizontal: 8, paddingVertical: 4,
        },
        voteCountText: { color: r.onPrimary, fontSize: 12, fontFamily: 'Inter_700Bold' },

        venueRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 8 },
        whyChip: {
            flexShrink: 0, backgroundColor: r.primary,
            paddingHorizontal: 8, paddingVertical: 4,
            borderRadius: radii.pill, marginBottom: 4,
        },
        whyChipText: { color: r.onPrimary, fontSize: 11, fontFamily: 'Inter_600SemiBold' },

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
            backgroundColor: r.scrimStrong,
            paddingHorizontal: 16, paddingVertical: 8,
            borderRadius: radii.pill, borderWidth: 1, borderColor: c.glassBorder,
        },
        toastText: { color: r.onMedia, fontSize: 13, fontFamily: 'Inter_500Medium' },

        pitchOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: r.scrim },
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
        pitchVenueName: { color: c.textPrimary, fontFamily: 'Inter_700Bold', fontSize: 18, marginBottom: 16 },
        pitchBody: { color: c.text80, fontSize: 15, fontFamily: 'Inter_400Regular', lineHeight: 22, marginBottom: 24 },
        pitchDismiss: { backgroundColor: c.primary, borderRadius: radii.md, paddingVertical: 12, alignItems: 'center' },
        pitchDismissText: { color: r.onPrimary, fontFamily: 'Inter_700Bold', fontSize: 15 },
    });
}
