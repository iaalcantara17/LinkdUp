import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Image,
    TouchableOpacity,
    ScrollView,
    ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useRoute } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Check, X, Star } from 'lucide-react-native';
import { api } from '../services/api';
import { supabase } from '../services/supabase';
import AvatarBubble from '../components/AvatarBubble';
import { typography, radii } from '../theme';
import type { AppColors } from '../theme';
import { useTheme } from '../context/ThemeContext';

interface Venue {
    id: string;
    name: string;
    category: string | null;
    address: string | null;
    photo_url: string | null;
    rating: number | null;
}

interface CrewMember {
    user_id: string;
    display_name: string;
    avatar_color?: string;
    avatar_url?: string;
}

export default function ProposalScreen() {
    const nav = useNavigation<any>();
    const route = useRoute<any>();
    const partyId: string = route.params?.partyId;
    const initialLocationId: string = route.params?.locationId;
    const { colors, isDark } = useTheme();
    const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);

    const [venue, setVenue] = useState<Venue | null>(null);
    const [partyName, setPartyName] = useState('');
    const [crew, setCrew] = useState<CrewMember[]>([]);
    const [responses, setResponses] = useState<Record<string, boolean | null>>({});
    const [votingRound, setVotingRound] = useState(1);
    const [proposalRank, setProposalRank] = useState(0);
    const [currentLocationId, setCurrentLocationId] = useState(initialLocationId);
    const [hasResponded, setHasResponded] = useState(false);
    const [responding, setResponding] = useState(false);
    const [loading, setLoading] = useState(true);
    const [loadingNextRound, setLoadingNextRound] = useState(false);

    const myUserIdRef = useRef<string | null>(null);
    const currentLocationIdRef = useRef(initialLocationId);

    const loadVenueAndParty = useCallback(async (locationId: string) => {
        try {
            const [partyData, members, me] = await Promise.all([
                api.getParty(partyId).catch(() => null),
                api.getMembers(partyId).catch(() => []),
                api.me().catch(() => null),
            ]);

            myUserIdRef.current = me?.id ?? null;

            if (partyData?.party) {
                setPartyName(partyData.party.name ?? 'Your Party');
                setVotingRound(partyData.party.voting_round ?? 1);
                setProposalRank(partyData.party.proposal_rank ?? 0);
            }

            if (Array.isArray(members)) {
                setCrew(members.map((m: any) => ({
                    user_id: m.user_id,
                    display_name: m.user_id === me?.id ? 'You' : (m.users?.display_name ?? '?'),
                    avatar_color: m.users?.avatar_color,
                    avatar_url: m.users?.avatar_url ?? undefined,
                })));
            }

            // Load venue from party locations
            const locs = await api.getLocations(partyId).catch(() => []);
            const found = locs.find((l: any) => l.id === locationId);
            if (found) setVenue(found);

            // Load existing responses for this proposal
            const { data: existingResponses } = await supabase
                .from('proposal_responses')
                .select('user_id, accepted')
                .eq('party_id', partyId)
                .eq('voting_round', partyData?.party?.voting_round ?? 1)
                .eq('proposal_rank', partyData?.party?.proposal_rank ?? 0);

            const responseMap: Record<string, boolean | null> = {};
            for (const r of (existingResponses ?? [])) {
                responseMap[r.user_id] = r.accepted;
            }
            setResponses(responseMap);

            if (me?.id && responseMap[me.id] !== undefined) {
                setHasResponded(true);
            }
        } catch (e) {
            console.error('[proposal] load error', e);
        } finally {
            setLoading(false);
        }
    }, [partyId]);

    useEffect(() => {
        loadVenueAndParty(initialLocationId);
    }, [loadVenueAndParty, initialLocationId]);

    useEffect(() => {
        if (!partyId) return;

        const proposalResponsesChannel = supabase
            .channel(`proposal_responses:${partyId}`)
            .on('postgres_changes', {
                event: '*', schema: 'public', table: 'proposal_responses',
                filter: `party_id=eq.${partyId}`,
            }, (payload: any) => {
                const r = payload.new;
                if (!r) return;
                setResponses(prev => ({ ...prev, [r.user_id]: r.accepted }));
            })
            .subscribe();

        const partiesChannel = supabase
            .channel(`proposal_parties:${partyId}`)
            .on('postgres_changes', {
                event: 'UPDATE', schema: 'public', table: 'parties',
                filter: `id=eq.${partyId}`,
            }, (payload: any) => {
                const p = payload.new;
                if (!p) return;

                if (p.status === 'matched') {
                    nav.replace('Match', { partyId });
                    return;
                }

                if (p.status === 'swiping') {
                    setLoadingNextRound(true);
                    setTimeout(() => {
                        nav.replace('Swipe', { partyId });
                    }, 1800);
                    return;
                }

                if (
                    p.status === 'proposing' &&
                    p.proposal_location_id &&
                    p.proposal_location_id !== currentLocationIdRef.current
                ) {
                    const newLocId: string = p.proposal_location_id;
                    currentLocationIdRef.current = newLocId;
                    setCurrentLocationId(newLocId);
                    setVotingRound(p.voting_round ?? 1);
                    setProposalRank(p.proposal_rank ?? 0);
                    setResponses({});
                    setHasResponded(false);
                    setResponding(false);

                    const locs = api.getLocations(partyId).catch(() => []);
                    locs.then((list: any[]) => {
                        const found = list.find((l: any) => l.id === newLocId);
                        if (found) setVenue(found);
                    });
                }
            })
            .subscribe();

        return () => {
            supabase.removeChannel(proposalResponsesChannel);
            supabase.removeChannel(partiesChannel);
        };
    }, [partyId, nav]);

    const handleRespond = useCallback(async (accepted: boolean) => {
        if (responding || hasResponded) return;
        setResponding(true);
        setHasResponded(true);
        const myId = myUserIdRef.current;
        if (myId) {
            setResponses(prev => ({ ...prev, [myId]: accepted }));
        }
        try {
            await api.respondToProposal(partyId, accepted);
        } catch (e: any) {
            console.warn('[proposal] respond error', e?.message);
            setHasResponded(false);
            if (myId) {
                setResponses(prev => {
                    const next = { ...prev };
                    delete next[myId];
                    return next;
                });
            }
        } finally {
            setResponding(false);
        }
    }, [partyId, responding, hasResponded]);

    const respondedCount = Object.keys(responses).length;
    const waitingMembers = crew.filter(m => responses[m.user_id] === undefined);

    if (loading) {
        return (
            <View style={[styles.root, { alignItems: 'center', justifyContent: 'center' }]}>
                <ActivityIndicator color={colors.primary} size="large" />
            </View>
        );
    }

    if (loadingNextRound) {
        return (
            <View style={[styles.root, { alignItems: 'center', justifyContent: 'center', padding: 32 }]}>
                <Text style={{ fontSize: 48, marginBottom: 24 }}>🔄</Text>
                <Text style={[typography.h2, { color: colors.textPrimary, textAlign: 'center', marginBottom: 12 }]}>
                    Loading 5 more spots for round {votingRound + 1}...
                </Text>
                <ActivityIndicator color={colors.primary} style={{ marginTop: 16 }} />
            </View>
        );
    }

    return (
        <View style={styles.root}>
            <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => nav.goBack()} style={styles.backBtn}>
                        <ArrowLeft size={22} color={colors.textPrimary} />
                    </TouchableOpacity>
                    <View style={{ flex: 1, alignItems: 'center' }}>
                        <Text style={styles.headerTitle}>The group's top pick</Text>
                        {partyName ? (
                            <Text style={styles.headerSub}>{partyName}</Text>
                        ) : null}
                    </View>
                    <View style={{ width: 40 }} />
                </View>

                <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
                    {venue ? (
                        <View style={styles.heroCard}>
                            {venue.photo_url ? (
                                <Image
                                    source={{ uri: venue.photo_url }}
                                    style={styles.heroPhoto}
                                    accessibilityLabel={venue.name}
                                    accessibilityRole="image"
                                />
                            ) : (
                                <View style={[styles.heroPhoto, { backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }]}>
                                    <Text style={{ fontSize: 48 }}>📍</Text>
                                </View>
                            )}
                            <LinearGradient
                                colors={['transparent', 'rgba(0,0,0,0.92)']}
                                style={styles.heroOverlay}
                            >
                                {venue.category ? (
                                    <View style={styles.categoryPill}>
                                        <Text style={styles.categoryText}>{venue.category}</Text>
                                    </View>
                                ) : null}
                                <Text style={styles.venueName}>{venue.name}</Text>
                                <View style={styles.venueMeta}>
                                    {venue.rating ? (
                                        <>
                                            <Star size={13} color="#FBBF24" fill="#FBBF24" />
                                            <Text style={styles.metaText}>{venue.rating}</Text>
                                            <Text style={styles.metaDot}>•</Text>
                                        </>
                                    ) : null}
                                    {venue.address ? (
                                        <Text style={[styles.metaText, { flex: 1 }]} numberOfLines={1}>{venue.address}</Text>
                                    ) : null}
                                </View>
                            </LinearGradient>
                        </View>
                    ) : null}

                    <View style={styles.section}>
                        <Text style={styles.sectionLabel}>Crew responses ({respondedCount}/{crew.length})</Text>
                        <View style={styles.crewRow}>
                            {crew.map((member) => {
                                const resp = responses[member.user_id];
                                return (
                                    <View key={member.user_id} style={{ alignItems: 'center', marginRight: 16 }}>
                                        <View>
                                            <AvatarBubble
                                                name={member.display_name}
                                                color={member.avatar_color}
                                                avatarUrl={member.avatar_url}
                                                size={44}
                                            />
                                            {resp === true && (
                                                <View style={styles.badgeYes}>
                                                    <Check size={10} color="white" />
                                                </View>
                                            )}
                                            {resp === false && (
                                                <View style={styles.badgeNo}>
                                                    <X size={10} color="white" />
                                                </View>
                                            )}
                                            {resp === undefined && (
                                                <View style={styles.badgePending} />
                                            )}
                                        </View>
                                        <Text style={styles.memberName} numberOfLines={1}>{member.display_name}</Text>
                                    </View>
                                );
                            })}
                        </View>
                        {waitingMembers.length > 0 && (
                            <Text style={styles.waitingText}>
                                Waiting for {waitingMembers.map(m => m.display_name).join(', ')}...
                            </Text>
                        )}
                    </View>

                    <Text style={styles.roundLabel}>
                        Round {votingRound} · Proposal {proposalRank + 1} of 3
                    </Text>

                    {hasResponded ? (
                        <View style={styles.waitingBanner}>
                            <ActivityIndicator color={colors.primary} size="small" style={{ marginRight: 10 }} />
                            <Text style={styles.waitingBannerText}>Waiting for the rest of the group...</Text>
                        </View>
                    ) : (
                        <View style={styles.actionRow}>
                            <TouchableOpacity
                                style={[styles.noBtn, responding && { opacity: 0.5 }]}
                                onPress={() => handleRespond(false)}
                                disabled={responding}
                                activeOpacity={0.85}
                            >
                                <Text style={styles.noBtnText}>No, show me the next one</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                onPress={() => handleRespond(true)}
                                disabled={responding}
                                activeOpacity={0.85}
                            >
                                <LinearGradient
                                    colors={colors.gradient as any}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 0 }}
                                    style={[styles.yesBtn, responding && { opacity: 0.5 }]}
                                >
                                    <Text style={styles.yesBtnText}>Yes, let's go! 🎉</Text>
                                </LinearGradient>
                            </TouchableOpacity>
                        </View>
                    )}
                </ScrollView>
            </SafeAreaView>
        </View>
    );
}

function makeStyles(c: AppColors, _dark: boolean) {
    return StyleSheet.create({
        root: { flex: 1, backgroundColor: c.bg },

        header: {
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 16,
            paddingVertical: 12,
            borderBottomWidth: 1,
            borderBottomColor: c.glassBorder,
        },
        backBtn: {
            width: 40,
            height: 40,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 20,
        },
        headerTitle: {
            color: c.textPrimary,
            fontFamily: 'Inter_700Bold',
            fontSize: 16,
        },
        headerSub: {
            color: c.text60,
            fontFamily: 'Inter_400Regular',
            fontSize: 12,
            marginTop: 2,
        },

        heroCard: {
            height: 300,
            borderRadius: radii.xl,
            overflow: 'hidden',
            marginBottom: 20,
            backgroundColor: c.surface,
        },
        heroPhoto: {
            width: '100%',
            height: '100%',
            resizeMode: 'cover',
        },
        heroOverlay: {
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            padding: 20,
            paddingTop: 60,
        },
        categoryPill: {
            alignSelf: 'flex-start',
            backgroundColor: 'rgba(108,62,244,0.75)',
            paddingHorizontal: 10,
            paddingVertical: 4,
            borderRadius: radii.pill,
            marginBottom: 8,
        },
        categoryText: { color: 'white', fontSize: 11, fontFamily: 'Inter_700Bold' },
        venueName: {
            color: 'white',
            fontFamily: 'Inter_900Black',
            fontSize: 26,
            marginBottom: 6,
        },
        venueMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
        metaText: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontFamily: 'Inter_400Regular' },
        metaDot: { color: 'rgba(255,255,255,0.5)' },

        section: {
            backgroundColor: c.surface,
            borderRadius: radii.lg,
            padding: 16,
            marginBottom: 16,
            borderWidth: 1,
            borderColor: c.glassBorder,
        },
        sectionLabel: {
            color: c.text60,
            fontFamily: 'Inter_600SemiBold',
            fontSize: 12,
            marginBottom: 14,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
        },
        crewRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
        memberName: {
            color: c.text60,
            fontFamily: 'Inter_400Regular',
            fontSize: 10,
            marginTop: 4,
            maxWidth: 52,
            textAlign: 'center',
        },

        badgeYes: {
            position: 'absolute',
            bottom: -2,
            right: -2,
            width: 20,
            height: 20,
            borderRadius: 10,
            backgroundColor: '#22C55E',
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 2,
            borderColor: c.surface,
        },
        badgeNo: {
            position: 'absolute',
            bottom: -2,
            right: -2,
            width: 20,
            height: 20,
            borderRadius: 10,
            backgroundColor: '#EF4444',
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 2,
            borderColor: c.surface,
        },
        badgePending: {
            position: 'absolute',
            bottom: -2,
            right: -2,
            width: 14,
            height: 14,
            borderRadius: 7,
            backgroundColor: c.text40,
            borderWidth: 2,
            borderColor: c.surface,
        },
        waitingText: {
            color: c.text60,
            fontFamily: 'Inter_400Regular',
            fontSize: 12,
            marginTop: 12,
            lineHeight: 18,
        },

        roundLabel: {
            color: c.text40,
            fontFamily: 'Inter_500Medium',
            fontSize: 12,
            textAlign: 'center',
            marginBottom: 20,
        },

        actionRow: { gap: 12 },
        yesBtn: {
            paddingVertical: 18,
            borderRadius: radii.lg,
            alignItems: 'center',
        },
        yesBtnText: { color: 'white', fontFamily: 'Inter_700Bold', fontSize: 17 },
        noBtn: {
            paddingVertical: 16,
            borderRadius: radii.lg,
            borderWidth: 1,
            borderColor: c.glassBorder,
            alignItems: 'center',
            backgroundColor: 'transparent',
        },
        noBtnText: { color: c.text80, fontFamily: 'Inter_600SemiBold', fontSize: 15 },

        waitingBanner: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
            backgroundColor: c.surface,
            borderRadius: radii.lg,
            borderWidth: 1,
            borderColor: c.glassBorder,
        },
        waitingBannerText: {
            color: c.text80,
            fontFamily: 'Inter_500Medium',
            fontSize: 15,
        },
    });
}
