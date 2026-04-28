import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Share, Switch } from 'react-native';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ArrowLeft, Maximize2 } from 'lucide-react-native';
import GradientButton from '../components/GradientButton';
import GlassCard from '../components/GlassCard';
import AvatarBubble from '../components/AvatarBubble';
import UserProfileSheet from '../components/UserProfileSheet';
import CrewMap from '../components/CrewMap';
import HelpButton from '../components/HelpButton';
import FirstVisitHint from '../components/FirstVisitHint';
import AnchoredHint from '../components/AnchoredHint';

const LOBBY_HELP: { title: string; description: string }[] = [
    { title: 'Crew map', description: 'See where everyone\'s at. Midpoint appears once swiping starts.' },
    { title: 'Start swiping', description: 'Kick off the matching round (host only).' },
    { title: 'Party code', description: 'Share this code so friends can join.' },
];
import { api } from '../services/api';
import { supabase } from '../services/supabase';
import { typography, radii } from '../theme';
import type { AppColors } from '../theme';
import { useTheme } from '../context/ThemeContext';

export default function PartyLobbyScreen() {
    const nav = useNavigation<any>();
    const route = useRoute<any>();
    const partyId: string = route.params.partyId;
    const { colors } = useTheme();
    const styles = useMemo(() => makeStyles(colors), [colors]);

    const [party, setParty] = useState<any>(null);
    const codeCardRef = useRef<View>(null);
    const [members, setMembers] = useState<any[]>([]);
    const [me, setMe] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [profileUserId, setProfileUserId] = useState<string | null>(null);
    const [lobbyTab, setLobbyTab] = useState<'party' | 'invite'>('party');
    const [friendsList, setFriendsList] = useState<any[]>([]);

    const refresh = useCallback(async () => {
        try {
            const [p, ms, sess] = await Promise.all([
                api.getParty(partyId).catch(() => null),
                api.getMembers(partyId).catch(() => []),
                supabase.auth.getUser(),
            ]);
            if (p?.party) setParty(p.party);
            setMembers(ms);
            setMe(sess.data.user?.id ?? null);
            try {
                const fr = await api.getFriends();
                setFriendsList(fr ?? []);
            } catch {
                setFriendsList([]);
            }
        } catch {}
    }, [partyId, nav]);

    useFocusEffect(
        useCallback(() => {
            refresh();
            const t = setInterval(refresh, 3000);
            return () => clearInterval(t);
        }, [refresh])
    );

    useEffect(() => {
        if (!partyId) return;
        const channel = supabase
            .channel(`lobby_members:${partyId}`)
            .on('postgres_changes', {
                event: 'INSERT', schema: 'public', table: 'party_members',
                filter: `party_id=eq.${partyId}`,
            }, () => { refresh(); })
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [partyId, refresh]);

    const isHost = party?.host_user_id === me;
    const isMatched = party?.status === 'matched';
    const isSwiping = party?.status === 'swiping';

    const handleStart = async () => {
        setLoading(true);
        try {
            await api.startParty(partyId);
            nav.replace('Swipe', { partyId });
        } catch (e: any) {
            const msg = e?.message ?? 'unknown';
            if (msg.includes('no_member_locations')) {
                Alert.alert(
                    'Location needed',
                    'At least one party member needs to set their location before starting.'
                );
            } else if (msg.includes('party_already_started')) {
                nav.replace('Swipe', { partyId });
            } else {
                Alert.alert('Could not start', msg);
            }
        } finally {
            setLoading(false);
        }
    };

    const handleJumpIntoSwipe = () => nav.replace('Swipe', { partyId });
    const handleSeeMatch = () => nav.replace('Match', { partyId });

    const handleReset = async () => {
        setLoading(true);
        try {
            await api.resetParty(partyId);
            await refresh();
            nav.replace('Swipe', { partyId });
        } catch (e: any) {
            Alert.alert('Could not reset', e?.message ?? 'unknown');
        } finally {
            setLoading(false);
        }
    };

    const handleShare = async () => {
        if (!party?.code) return;
        await Share.share({ message: `Join my LinkdUp party! Code: ${party.code}` });
    };

    const handleToggleVisibility = async () => {
        if (!party) return;
        if (!party.is_public) {
            Alert.alert(
                'Make party public?',
                'Anyone nearby will be able to find and join your party from the Discover tab.',
                [
                    { text: 'Cancel', style: 'cancel' },
                    {
                        text: 'Make Public',
                        onPress: async () => {
                            try {
                                await api.updatePartyVisibility(partyId, true);
                                refresh();
                            } catch (e: any) {
                                Alert.alert('Could not update', e?.message ?? 'Unknown error');
                            }
                        },
                    },
                ]
            );
        } else {
            try {
                await api.updatePartyVisibility(partyId, false);
                refresh();
            } catch (e: any) {
                Alert.alert('Could not update', e?.message ?? 'Unknown error');
            }
        }
    };

    return (
        <View style={styles.root}>
            <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => nav.goBack()} style={{ padding: 8 }}>
                        <ArrowLeft size={24} color={colors.textPrimary} />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Party Lobby</Text>
                    <HelpButton items={LOBBY_HELP} />
                </View>

                <ScrollView contentContainerStyle={{ padding: 24 }} showsVerticalScrollIndicator={false}>
                    <Animated.View entering={FadeInDown.duration(400)}>
                        <Text style={styles.title}>{party?.name ?? 'Loading...'}</Text>
                        <Text style={styles.sub}>Status: {party?.status ?? '...'}</Text>

                        <View style={styles.tabRow}>
                            <TouchableOpacity
                                style={[styles.tabPill, lobbyTab === 'party' && styles.tabPillOn]}
                                onPress={() => setLobbyTab('party')}
                            >
                                <Text style={[styles.tabPillText, lobbyTab === 'party' && styles.tabPillTextOn]}>Party</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.tabPill, lobbyTab === 'invite' && styles.tabPillOn]}
                                onPress={() => setLobbyTab('invite')}
                            >
                                <Text style={[styles.tabPillText, lobbyTab === 'invite' && styles.tabPillTextOn]}>Invite friends</Text>
                            </TouchableOpacity>
                        </View>

                        {lobbyTab === 'invite' ? (
                            <View style={{ marginVertical: 16 }}>
                                <Text style={styles.inviteHint}>
                                    Share your party code with friends — they can join in LinkdUp with this code.
                                </Text>
                                <GlassCard style={{ marginBottom: 16, alignItems: 'center' }}>
                                    <Text style={styles.codeLabel}>CODE</Text>
                                    <TouchableOpacity onPress={handleShare} activeOpacity={0.8}>
                                        <Text style={styles.code}>{party?.code ?? '------'}</Text>
                                    </TouchableOpacity>
                                </GlassCard>
                                <Text style={styles.crewLabel}>Your friends</Text>
                                {friendsList.length === 0 ? (
                                    <Text style={styles.waiting}>No friends yet — add some from Home → Friends.</Text>
                                ) : (
                                    friendsList.map((f: any) => (
                                        <View key={f.id} style={styles.friendRow}>
                                            <Text style={styles.friendName}>{f.display_name}</Text>
                                            <Text style={styles.friendMeta}>Share the code above</Text>
                                        </View>
                                    ))
                                )}
                            </View>
                        ) : null}

                        {lobbyTab === 'party' && (
                        <>
                        <View ref={codeCardRef}>
                        <GlassCard style={{ marginVertical: 24, alignItems: 'center' }}>
                            <Text style={styles.codeLabel}>JOIN CODE</Text>
                            <TouchableOpacity onPress={handleShare} activeOpacity={0.8}>
                                <Text style={styles.code}>{party?.code ?? '------'}</Text>
                            </TouchableOpacity>
                            <Text style={styles.tapHint}>tap to share</Text>
                        </GlassCard>
                        </View>

                        <Text style={styles.crewLabel}>Crew ({members.length})</Text>
                        <View style={styles.crew}>
                            {members.map((m: any) => (
                                <View key={m.user_id} style={{ alignItems: 'center', marginRight: 16, marginBottom: 16 }}>
                                    <AvatarBubble
                                        name={m.users?.display_name ?? '?'}
                                        color={m.users?.avatar_color}
                                        avatarUrl={m.users?.avatar_url ?? undefined}
                                        onPress={m.user_id !== me ? () => setProfileUserId(m.user_id) : undefined}
                                    />
                                    <Text style={styles.crewName}>{m.users?.display_name ?? '?'}</Text>
                                </View>
                            ))}
                        </View>

                        {(() => {
                            const mapMembers = members
                                .filter((m: any) => m.display_lat != null && m.display_lng != null)
                                .map((m: any) => ({
                                    user_id: m.user_id,
                                    display_name: m.users?.display_name ?? '?',
                                    avatar_url: m.users?.avatar_url ?? null,
                                    avatar_color: m.users?.avatar_color ?? null,
                                    display_lat: m.display_lat,
                                    display_lng: m.display_lng,
                                }));
                            if (mapMembers.length === 0) return null;
                            const mapMidpoint = party?.midpoint_lat
                                ? { lat: party.midpoint_lat, lng: party.midpoint_lng }
                                : null;
                            return (
                                <View style={{ marginBottom: 24 }}>
                                    <Text style={[styles.crewLabel, { marginBottom: 4 }]}>Where everyone's at</Text>
                                    <Text style={styles.mapPrivacyNote}>Locations are approximate for privacy.</Text>
                                    <TouchableOpacity
                                        onPress={() => nav.navigate('CrewMapFullscreen', { partyId })}
                                        activeOpacity={0.92}
                                    >
                                        <View style={{ position: 'relative' }}>
                                            <CrewMap
                                                members={mapMembers}
                                                midpoint={mapMidpoint}
                                                radiusMeters={party?.search_radius_meters ?? 10000}
                                                height={260}
                                                showMidpoint={isSwiping || isMatched}
                                                onMemberPress={(id) => setProfileUserId(id)}
                                            />
                                            <View style={styles.mapExpandBtn}>
                                                <Maximize2 size={14} color="white" />
                                            </View>
                                        </View>
                                    </TouchableOpacity>
                                    <Text style={styles.tapToExpand}>Tap to expand</Text>
                                </View>
                            );
                        })()}

                        {isHost && (
                            <GlassCard style={{ marginBottom: 16 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <View style={{ flex: 1, marginRight: 12 }}>
                                        <Text style={styles.visibilityTitle}>
                                            {party?.is_public ? 'Public - visible in Discover' : 'Private'}
                                        </Text>
                                        <Text style={styles.visibilitySub}>
                                            {party?.is_public
                                                ? 'Anyone nearby can join from Discover'
                                                : 'Only people with the invite code can join'}
                                        </Text>
                                    </View>
                                    <Switch
                                        value={!(party?.is_public ?? false)}
                                        onValueChange={handleToggleVisibility}
                                        trackColor={{ false: colors.glass, true: colors.primary }}
                                        thumbColor="white"
                                    />
                                </View>
                            </GlassCard>
                        )}

                        {isMatched ? (
                            <>
                                <GradientButton title="See the match" onPress={handleSeeMatch} />
                                {isHost && (
                                    <>
                                        <View style={{ height: 12 }} />
                                        <GradientButton
                                            title="Swipe again (clears votes)"
                                            variant="ghost"
                                            onPress={handleReset}
                                            loading={loading}
                                        />
                                    </>
                                )}
                            </>
                        ) : isSwiping ? (
                            <GradientButton title="Jump into swiping" onPress={handleJumpIntoSwipe} />
                        ) : isHost ? (
                            <GradientButton title="Start swiping" onPress={handleStart} loading={loading} />
                        ) : (
                            <Text style={styles.waiting}>Waiting for the host to start...</Text>
                        )}
                        </>
                        )}
                    </Animated.View>
                </ScrollView>
            </SafeAreaView>

            <UserProfileSheet
                userId={profileUserId}
                visible={profileUserId !== null}
                onClose={() => setProfileUserId(null)}
            />
            <AnchoredHint
                screenKey="party_share_code"
                title="Invite your crew"
                body="Share your party code with friends so they can join. The more people, the better the midpoint."
                targetRef={codeCardRef}
                placement="bottom"
            />
        </View>
    );
}

function makeStyles(c: AppColors) {
    return StyleSheet.create({
        root: { flex: 1, backgroundColor: c.bg },
        header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingTop: 8 },
        headerTitle: { ...typography.h3, color: c.textPrimary },
        title: { color: c.textPrimary, fontFamily: 'Inter_900Black', fontSize: 32 },
        sub: { color: c.text60, fontSize: 13, marginTop: 4, fontFamily: 'Inter_400Regular' },
        codeLabel: { color: c.text60, fontSize: 11, letterSpacing: 1, marginBottom: 8, fontFamily: 'Inter_700Bold' },
        code: { color: c.textPrimary, fontFamily: 'Inter_900Black', fontSize: 48, letterSpacing: 8 },
        tapHint: { color: c.text40, fontSize: 11, marginTop: 8, fontFamily: 'Inter_400Regular' },
        crewLabel: { color: c.textPrimary, fontFamily: 'Inter_700Bold', fontSize: 18, marginBottom: 16 },
        crew: { flexDirection: 'row', flexWrap: 'wrap' },
        crewName: { color: c.textPrimary, fontSize: 12, marginTop: 4, fontFamily: 'Inter_500Medium' },
        waiting: { color: c.text60, textAlign: 'center', marginTop: 32, fontFamily: 'Inter_500Medium' },
        tabRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
        tabPill: {
            flex: 1,
            paddingVertical: 10,
            borderRadius: radii.pill,
            borderWidth: 1,
            borderColor: c.glassBorder,
            alignItems: 'center',
        },
        tabPillOn: { borderColor: c.primary, backgroundColor: 'rgba(108,62,244,0.15)' },
        tabPillText: { color: c.text60, fontFamily: 'Inter_600SemiBold', fontSize: 13 },
        tabPillTextOn: { color: c.textPrimary },
        inviteHint: { color: c.text60, fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 19, marginBottom: 8 },
        friendRow: {
            paddingVertical: 12,
            borderBottomWidth: 1,
            borderBottomColor: c.glassBorder,
        },
        friendName: { color: c.textPrimary, fontFamily: 'Inter_600SemiBold', fontSize: 15 },
        friendMeta: { color: c.text40, fontSize: 12, marginTop: 2, fontFamily: 'Inter_400Regular' },
        visibilityTitle: { color: c.textPrimary, fontFamily: 'Inter_600SemiBold', fontSize: 15 },
        visibilitySub: { color: c.text60, fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 2 },
        mapPrivacyNote: { color: c.text40, fontSize: 11, fontFamily: 'Inter_400Regular', marginBottom: 12 },
        mapExpandBtn: {
            position: 'absolute',
            top: 10,
            right: 10,
            backgroundColor: 'rgba(0,0,0,0.52)',
            padding: 6,
            borderRadius: radii.sm,
        },
        tapToExpand: {
            color: c.text40,
            fontSize: 12,
            fontFamily: 'Inter_500Medium',
            textAlign: 'center',
            marginTop: 6,
        },
    });
}
