import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Share, Platform } from 'react-native';
import { Chip, ScreenHeader, Tap } from '../components/kit';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Maximize2, Share2 } from '../components/icons';
import GradientButton from '../components/GradientButton';
import JoinQr from '../components/JoinQr';
import { joinUrl } from '../services/joinLink';
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
    { title: 'Locked-step voting', description: 'Swipe together — 10 spots, then pick the winner.' },
];
import { api, MyLocation } from '../services/api';
import { errorText, showError, toast } from '../components/dialogs';
import LocationSourceCard from '../components/LocationSourceCard';
import { LoadError, SlowLoadNote } from '../components/LoadState';
import { startGate } from '../services/locationChoice';
import { supabase } from '../services/supabase';
import { radii, motion } from '../theme';
import type { AppColors, ColorRoles } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { pollWhileVisible, LOBBY_POLL_MS } from '../hooks/pollWhileVisible';

export default function PartyLobbyScreen() {
    const nav = useNavigation<any>();
    const route = useRoute<any>();
    const partyId: string = route.params.partyId;
    const { colors, roles } = useTheme();
    const styles = useMemo(() => makeStyles(colors, roles), [colors, roles]);

    const [party, setParty] = useState<any>(null);
    const [loadError, setLoadError] = useState<unknown>(null);
    const codeCardRef = useRef<View>(null);
    const [members, setMembers] = useState<any[]>([]);
    const [me, setMe] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [profileUserId, setProfileUserId] = useState<string | null>(null);
    const [lobbyTab, setLobbyTab] = useState<'party' | 'invite'>('party');
    const [friendsList, setFriendsList] = useState<any[]>([]);
    const [myLocation, setMyLocation] = useState<MyLocation | null>(null);
    const [popularSpots, setPopularSpots] = useState<any[] | null>(null);

    const refresh = useCallback(async () => {
        let partyError: unknown = null;
        try {
            const [p, ms, sess] = await Promise.all([
                api.getParty(partyId).catch((e) => { partyError = e; return null; }),
                api.getMembers(partyId).catch(() => null),
                supabase.auth.getUser(),
            ]);
            setLoadError(partyError);
            if (p?.party) setParty(p.party);
            if (p?.my_location) setMyLocation(p.my_location);
            if (ms) setMembers(ms);
            setMe(sess.data.user?.id ?? null);
        } catch {}
    }, [partyId, nav]);

    useFocusEffect(
        useCallback(() => {
            refresh();
            api.getFriends().then((fr) => setFriendsList(fr ?? []), () => setFriendsList([]));
            return pollWhileVisible(refresh, LOBBY_POLL_MS);
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
    const gate = startGate(members);

    const handleStart = async () => {
        setLoading(true);
        try {
            await api.startParty(partyId);
            nav.replace('Swipe', { partyId });
        } catch (e: any) {
            const msg = String(e?.message);
            if (e?.data?.fallback && Array.isArray(e.data.venues)) {
                setPopularSpots(e.data.venues);
            } else if (msg.includes('no_member_locations')) {
                showError(
                    'Add a location first',
                    'No one in this party has a location yet. Turn on live location or pick a place under Your location, then start again.'
                );
            } else if (msg.includes('party_already_started')) {
                nav.replace('Swipe', { partyId });
            } else {
                showError("Couldn't start the party", errorText(e, 'Try again in a moment.'));
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
            showError("Couldn't restart swiping", errorText(e, 'Try again in a moment.'));
        } finally {
            setLoading(false);
        }
    };

    const code: string | undefined = party?.code;
    const link = code ? joinUrl(code, Platform.OS === 'web' && typeof location !== 'undefined' ? location.origin : undefined) : '';
    const inviteText = `Join my LinkdUp party! Code: ${code}`;

    const copy = async (text: string) => {
        const clip = Platform.OS === 'web' && typeof navigator !== 'undefined' ? (navigator as any).clipboard : undefined;
        if (!clip?.writeText) {
            Share.share({ message: text }).catch(() => {});
            return;
        }
        try {
            await clip.writeText(text);
            toast('Code copied');
        } catch {
            toast(`Code: ${code}`, 'info');
        }
    };

    const handleCopy = () => {
        if (code) copy(code);
    };

    const handleShare = async () => {
        if (!code) return;
        if (Platform.OS !== 'web') {
            Share.share({ message: `${inviteText} ${link}` }).catch(() => {});
            return;
        }
        const share = typeof navigator !== 'undefined' ? (navigator as any).share : undefined;
        if (share) {
            try {
                await share.call(navigator, { title: 'Join my LinkdUp party', text: inviteText, url: link });
                return;
            } catch (e: any) {
                if (e?.name === 'AbortError') return;
            }
        }
        copy(`${inviteText} ${link}`);
    };

    return (
        <View style={styles.root}>
            <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
                <ScreenHeader title="Party Lobby" onBack={() => nav.goBack()} right={<HelpButton items={LOBBY_HELP} />} />

                <ScrollView contentContainerStyle={{ padding: 24 }} showsVerticalScrollIndicator={false}>
                    {!party && loadError ? (
                        <LoadError
                            title="We couldn't load this party"
                            error={loadError}
                            onRetry={() => {
                                setLoadError(null);
                                refresh();
                            }}
                        />
                    ) : (
                    <Animated.View entering={FadeInDown.duration(motion.base)}>
                        <Text style={styles.title}>{party?.name ?? 'Loading...'}</Text>
                        {!party && <SlowLoadNote loading />}
                        <Text style={styles.sub}>Status: {party?.status ?? '...'}</Text>
                        <Text style={[styles.sub, { marginTop: 4, color: colors.text40 }]}>
                            Swipe together — 10 spots, then pick the winner
                        </Text>

                        <View style={styles.tabRow}>
                            <Chip label="Party" selected={lobbyTab === 'party'} onPress={() => setLobbyTab('party')} style={{ flex: 1 }} />
                            <Chip label="Invite friends" selected={lobbyTab === 'invite'} onPress={() => setLobbyTab('invite')} style={{ flex: 1 }} />
                        </View>

                        {lobbyTab === 'invite' ? (
                            <View style={{ marginVertical: 16 }}>
                                <Text style={styles.inviteHint}>
                                    Share your party code with friends — they can join in LinkdUp with this code.
                                </Text>
                                <GlassCard style={{ marginBottom: 16, alignItems: 'center' }}>
                                    <Text style={styles.codeLabel}>CODE</Text>
                                    <Tap onPress={handleCopy} accessibilityLabel={`Copy join code ${code ?? ''}`} activeOpacity={0.8}>
                                        <Text style={styles.code}>{code ?? '------'}</Text>
                                    </Tap>
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
                            <Tap onPress={handleCopy} accessibilityLabel={`Copy join code ${code ?? ''}`} activeOpacity={0.8}>
                                <Text style={styles.code}>{code ?? '------'}</Text>
                            </Tap>
                            <Text style={styles.tapHint}>tap to copy</Text>
                            {code ? (
                                <View style={styles.qr}>
                                    <JoinQr value={link} label={`QR code to join with ${code}`} />
                                    <Text style={styles.tapHint}>Friends can scan to join</Text>
                                </View>
                            ) : null}
                            <GradientButton
                                title="Share"
                                variant="ghost"
                                onPress={handleShare}
                                disabled={!code}
                                leftIcon={<Share2 size={18} color={colors.textPrimary} />}
                                style={styles.shareBtn}
                            />
                        </GlassCard>
                        </View>

                        <LocationSourceCard partyId={partyId} myLocation={myLocation} onChanged={refresh} />

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
                                    <View style={{ position: 'relative' }}>
                                        <Tap
                                            onPress={() => nav.navigate('CrewMapFullscreen', { partyId })}
                                            accessibilityRole="none"
                                            activeOpacity={1}
                                        >
                                            <CrewMap
                                                members={mapMembers}
                                                midpoint={mapMidpoint}
                                                radiusMeters={party?.search_radius_meters ?? 10000}
                                                height={260}
                                                showMidpoint={isSwiping || isMatched}
                                                onMemberPress={(id) => setProfileUserId(id)}
                                            />
                                        </Tap>
                                        <Tap
                                            style={styles.mapExpandBtn}
                                            onPress={() => nav.navigate('CrewMapFullscreen', { partyId })}
                                            accessibilityLabel="Expand map"
                                            hitSlop={8}
                                        >
                                            <Maximize2 size={14} color={roles.onMedia} />
                                        </Tap>
                                    </View>
                                    <Text style={styles.tapToExpand}>Tap to expand</Text>
                                </View>
                            );
                        })()}

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
                            <>
                                <GradientButton title="Start swiping" onPress={handleStart} loading={loading} disabled={!gate.canStart} />
                                {!gate.canStart && (
                                    <Text style={[styles.waiting, { marginTop: 12 }]} accessibilityLiveRegion="polite">{gate.reason}</Text>
                                )}
                            </>
                        ) : (
                            <Text style={styles.waiting}>Waiting for the host to start...</Text>
                        )}
                        {popularSpots && popularSpots.length > 0 && (
                            <View style={{ marginTop: 24 }}>
                                <Text style={[styles.crewLabel, { marginBottom: 4 }]}>Popular spots</Text>
                                <Text style={styles.mapPrivacyNote} accessibilityLiveRegion="polite">Live lookups are paused today.</Text>
                                {popularSpots.map((v: any) => (
                                    <View key={v.google_place_id} style={styles.friendRow}>
                                        <Text style={styles.friendName}>{v.name}</Text>
                                        <Text style={styles.friendMeta}>{[v.category, v.address].filter(Boolean).join(' · ')}</Text>
                                    </View>
                                ))}
                            </View>
                        )}
                        </>
                        )}
                    </Animated.View>
                    )}
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

function makeStyles(c: AppColors, r: ColorRoles) {
    return StyleSheet.create({
        root: { flex: 1, backgroundColor: c.bg },
        title: { color: c.textPrimary, fontFamily: 'Inter_900Black', fontSize: 32 },
        sub: { color: c.text60, fontSize: 13, marginTop: 4, fontFamily: 'Inter_400Regular' },
        codeLabel: { color: c.text60, fontSize: 11, letterSpacing: 1, marginBottom: 8, fontFamily: 'Inter_700Bold' },
        code: { color: c.textPrimary, fontFamily: 'Inter_900Black', fontSize: 48, letterSpacing: 8 },
        tapHint: { color: c.text40, fontSize: 11, marginTop: 8, fontFamily: 'Inter_400Regular' },
        qr: { alignItems: 'center', marginTop: 16 },
        shareBtn: { alignSelf: 'stretch', marginTop: 16 },
        crewLabel: { color: c.textPrimary, fontFamily: 'Inter_700Bold', fontSize: 18, marginBottom: 16 },
        crew: { flexDirection: 'row', flexWrap: 'wrap' },
        crewName: { color: c.textPrimary, fontSize: 12, marginTop: 4, fontFamily: 'Inter_500Medium' },
        waiting: { color: c.text60, textAlign: 'center', marginTop: 32, fontFamily: 'Inter_500Medium' },
        tabRow: { flexDirection: 'row', gap: 8, marginTop: 16 },
        inviteHint: { color: c.text60, fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 19, marginBottom: 8 },
        friendRow: {
            paddingVertical: 12,
            borderBottomWidth: 1,
            borderBottomColor: c.glassBorder,
        },
        friendName: { color: c.textPrimary, fontFamily: 'Inter_600SemiBold', fontSize: 15 },
        friendMeta: { color: c.text40, fontSize: 12, marginTop: 4, fontFamily: 'Inter_400Regular' },
        mapPrivacyNote: { color: c.text40, fontSize: 11, fontFamily: 'Inter_400Regular', marginBottom: 12 },
        mapExpandBtn: {
            position: 'absolute',
            top: 10,
            right: 10,
            backgroundColor: r.scrim,
            padding: 8,
            borderRadius: radii.sm,
        },
        tapToExpand: {
            color: c.text40,
            fontSize: 12,
            fontFamily: 'Inter_500Medium',
            textAlign: 'center',
            marginTop: 8,
        },
    });
}
