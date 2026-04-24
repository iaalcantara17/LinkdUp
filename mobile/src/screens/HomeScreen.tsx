import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Pressable, Modal, Image, RefreshControl, Alert, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaskedView from '@react-native-masked-view/masked-view';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';
import { Plus, MoreVertical, Users, ChevronRight } from 'lucide-react-native';
import BottomNav from '../components/BottomNav';
import HelpButton from '../components/HelpButton';
import FirstVisitHint from '../components/FirstVisitHint';
import AnchoredHint from '../components/AnchoredHint';

const HOME_HELP: { title: string; description: string }[] = [
    { title: 'Your parties', description: 'Rejoin any party you\'ve created or accepted.' },
    { title: 'Create a party', description: 'Tap the + button to start a new meetup.' },
    { title: 'Find friends', description: 'Open the Friends card to search, request, and accept friends.' },
];
import { api } from '../services/api';
import { colors, typography, radii } from '../theme';

interface PartyRow {
    id: string;
    name: string;
    code: string;
    status: 'waiting' | 'swiping' | 'matched' | 'scheduled' | 'done';
    host_user_id: string;
    matched_location_id: string | null;
}

function GradientWordmark() {
    try {
        return (
            <MaskedView maskElement={<Text style={[styles.wordmark, { color: 'white' }]}>LINKDUP</Text>}>
                <LinearGradient colors={colors.gradient as any} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                    <Text style={[styles.wordmark, { opacity: 0 }]}>LINKDUP</Text>
                </LinearGradient>
            </MaskedView>
        );
    } catch {
        return <Text style={[styles.wordmark, { color: colors.primary }]}>LINKDUP</Text>;
    }
}

export default function HomeScreen() {
    const nav = useNavigation<any>();
    const [parties, setParties] = useState<PartyRow[]>([]);
    const [refreshing, setRefreshing] = useState(false);
    const [me, setMe] = useState<any>(null);
    const [menuParty, setMenuParty] = useState<PartyRow | null>(null);
    const [displayParty, setDisplayParty] = useState<PartyRow | null>(null);
    const [pendingCount, setPendingCount] = useState(0);
    const walkthroughCheckedRef = useRef(false);
    const friendsCardRef = useRef<View>(null);

    const load = useCallback(async () => {
        try {
            const [myProfile, myParties, pendingReqs] = await Promise.all([
                api.me().catch(() => null),
                api.myParties().catch(() => []),
                api.getPendingRequests().catch(() => []),
            ]);
            if (myProfile) {
                setMe(myProfile);
                if (!walkthroughCheckedRef.current) {
                    walkthroughCheckedRef.current = true;
                    if (!myProfile.has_seen_walkthrough && myProfile.display_name) {
                        nav.replace('Walkthrough', { fromSignup: true });
                        return;
                    }
                }
            }
            setParties(myParties ?? []);
            setPendingCount((pendingReqs ?? []).length);
        } catch {}
    }, []);

    useFocusEffect(useCallback(() => { load(); }, [load]));

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await load();
        setRefreshing(false);
    }, [load]);

    const openPartyMenu = (party: PartyRow) => {
        console.log('[menu] openPartyMenu fired for', party.id, 'host?', party.host_user_id === me?.id);
        setDisplayParty(party);
        setMenuParty(party);
    };

    const closePartyMenu = () => {
        setMenuParty(null);
        setTimeout(() => setDisplayParty(null), 300);
    };

    const confirmDelete = async (party: PartyRow) => {
        setMenuParty(null);
        let ok: boolean;
        if (Platform.OS === 'web') {
            ok = (window as any).confirm(`Delete "${party.name}"? This cannot be undone.`);
        } else {
            ok = await new Promise<boolean>(resolve => {
                Alert.alert('Delete party', 'This cannot be undone.', [
                    { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
                    { text: 'Delete', style: 'destructive', onPress: () => resolve(true) },
                ]);
            });
        }
        if (!ok) return;
        try {
            await api.deleteParty(party.id);
            setParties(ps => ps.filter(p => p.id !== party.id));
        } catch (e: any) {
            Alert.alert('Could not delete', e?.message ?? 'unknown');
        }
    };

    const confirmLeave = async (party: PartyRow) => {
        setMenuParty(null);
        let ok: boolean;
        if (Platform.OS === 'web') {
            ok = (window as any).confirm(`Leave "${party.name}"?`);
        } else {
            ok = await new Promise<boolean>(resolve => {
                Alert.alert('Leave party', 'You will be removed from this party.', [
                    { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
                    { text: 'Leave', style: 'destructive', onPress: () => resolve(true) },
                ]);
            });
        }
        if (!ok) return;
        try {
            await api.leaveParty(party.id);
            setParties(ps => ps.filter(p => p.id !== party.id));
        } catch (e: any) {
            Alert.alert('Could not leave', e?.message ?? 'unknown');
        }
    };

    const routeForParty = (p: PartyRow) => {
        if (p.status === 'matched' || p.status === 'scheduled' || p.status === 'done') {
            return { screen: 'Match', params: { partyId: p.id } };
        }
        if (p.status === 'swiping') {
            return { screen: 'Swipe', params: { partyId: p.id } };
        }
        return { screen: 'PartyLobby', params: { partyId: p.id } };
    };

    return (
        <View style={styles.root}>
            <SafeAreaView style={{ flex: 1 }} edges={['top']}>
                <ScrollView
                    contentContainerStyle={{ paddingBottom: 160 }}
                    showsVerticalScrollIndicator={false}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="white" />}
                >
                    <Animated.View entering={FadeInDown.duration(400)} style={styles.header}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                            <GradientWordmark />
                            <HelpButton items={HOME_HELP} />
                        </View>
                        <Text style={styles.greeting}>
                            {me?.display_name ? `Hey ${me.display_name}! 👋` : 'Hey there! 👋'}
                        </Text>
                    </Animated.View>

                    {/* Friends card — prominent, discoverable */}
                    <View ref={friendsCardRef}>
                    <TouchableOpacity
                        onPress={() => nav.navigate('Friends')}
                        style={styles.friendsCard}
                        activeOpacity={0.85}
                    >
                        <View style={styles.friendsCardAccent} />
                        <View style={styles.friendsCardBody}>
                            <View style={styles.friendsCardIcon}>
                                <Users size={22} color="white" />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.friendsCardTitle}>Friends</Text>
                                <Text style={styles.friendsCardSubtitle}>
                                    {pendingCount > 0
                                        ? `${pendingCount} pending ${pendingCount === 1 ? 'request' : 'requests'}`
                                        : 'Find and add friends'}
                                </Text>
                            </View>
                            {pendingCount > 0 && (
                                <View style={styles.friendsCardBadge}>
                                    <Text style={styles.friendsCardBadgeText}>
                                        {pendingCount > 9 ? '9+' : pendingCount}
                                    </Text>
                                </View>
                            )}
                            <ChevronRight size={20} color="rgba(255,255,255,0.4)" />
                        </View>
                    </TouchableOpacity>
                    </View>

                    <View style={{ marginTop: 32, paddingHorizontal: 24 }}>
                        <Text style={styles.sectionHeader}>Your Parties</Text>

                        {parties.length === 0 ? (
                            <View style={styles.emptyCard}>
                                <Text style={styles.emptyTitle}>No parties yet</Text>
                                <Text style={styles.emptyBody}>
                                    Tap the + button below to create your first party, or join one with a code.
                                </Text>
                            </View>
                        ) : (
                            parties.map((party, i) => {
                                const target = routeForParty(party);
                                const statusLabel =
                                    party.status === 'matched' ? 'MATCHED' :
                                    party.status === 'scheduled' ? 'SCHEDULED' :
                                    party.status === 'swiping' ? 'SWIPING' :
                                    party.status === 'done' ? 'DONE' : 'WAITING';
                                const statusColors: [string, string] =
                                    party.status === 'matched' || party.status === 'scheduled' ? ['#22C55E', '#10B981'] :
                                    party.status === 'swiping' ? (colors.gradient as any) :
                                    ['rgba(255,255,255,0.10)', 'rgba(255,255,255,0.10)'];

                                return (
                                    <Animated.View key={party.id} entering={FadeInDown.delay(i * 80).duration(400)}>
                                        {/* Pressable handles child press bubbling correctly on web.
                                            TouchableOpacity inside TouchableOpacity swallows inner taps on web. */}
                                        <Pressable
                                            onPress={() => nav.navigate(target.screen, target.params)}
                                            style={({ pressed }) => [styles.partyCard, pressed && { opacity: 0.85 }]}
                                        >
                                            <View style={styles.partyHeader}>
                                                <View style={{ flex: 1 }}>
                                                    <Text style={styles.partyName}>{party.name}</Text>
                                                    <Text style={styles.partyMeta}>code · {party.code}</Text>
                                                </View>
                                                <LinearGradient
                                                    colors={statusColors}
                                                    start={{ x: 0, y: 0 }}
                                                    end={{ x: 1, y: 0 }}
                                                    style={styles.statusPill}
                                                >
                                                    <Text style={styles.statusText}>{statusLabel}</Text>
                                                </LinearGradient>
                                                <TouchableOpacity
                                                    onPress={(e) => {
                                                        e.stopPropagation?.();
                                                        openPartyMenu(party);
                                                    }}
                                                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                                                    style={{ marginLeft: 8, padding: 8, zIndex: 10 }}
                                                    activeOpacity={0.6}
                                                >
                                                    <MoreVertical size={20} color={colors.text80} />
                                                </TouchableOpacity>
                                            </View>
                                        </Pressable>
                                    </Animated.View>
                                );
                            })
                        )}

                        <TouchableOpacity
                            style={styles.joinRow}
                            onPress={() => nav.navigate('JoinParty')}
                            activeOpacity={0.8}
                        >
                            <Text style={styles.joinText}>Have a code? Join a party →</Text>
                        </TouchableOpacity>
                    </View>
                </ScrollView>
            </SafeAreaView>

            <TouchableOpacity
                style={styles.fab}
                activeOpacity={0.85}
                onPress={() => nav.navigate('CreateParty')}
            >
                <LinearGradient colors={colors.gradient as any} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.fabGradient}>
                    <Plus size={32} color="white" />
                </LinearGradient>
            </TouchableOpacity>

            <AnchoredHint
                screenKey="home_friends_card"
                title="Add friends to the party"
                body="Tap here anytime to send friend requests, see who's pending, and find people from your school."
                targetRef={friendsCardRef}
                placement="bottom"
            />
            <BottomNav />

            {/* ── Party action sheet (works on web + native) ───────────── */}
            <Modal
                visible={menuParty !== null}
                transparent
                animationType="fade"
                onRequestClose={closePartyMenu}
            >
                <Pressable
                    style={styles.menuOverlay}
                    onPress={closePartyMenu}
                >
                    <View style={styles.menuSheet}>
                        <Text style={styles.menuTitle}>
                            {displayParty?.name ?? 'Party options'}
                        </Text>

                        {displayParty?.host_user_id === me?.id ? (
                            <TouchableOpacity
                                style={styles.menuRow}
                                onPress={() => displayParty && confirmDelete(displayParty)}
                                activeOpacity={0.7}
                            >
                                <Text style={styles.menuDestructive}>Delete party</Text>
                            </TouchableOpacity>
                        ) : (
                            <TouchableOpacity
                                style={styles.menuRow}
                                onPress={() => displayParty && confirmLeave(displayParty)}
                                activeOpacity={0.7}
                            >
                                <Text style={styles.menuDestructive}>Leave party</Text>
                            </TouchableOpacity>
                        )}

                        <TouchableOpacity
                            style={styles.menuRow}
                            onPress={closePartyMenu}
                            activeOpacity={0.7}
                        >
                            <Text style={styles.menuCancel}>Cancel</Text>
                        </TouchableOpacity>
                    </View>
                </Pressable>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    header: { paddingHorizontal: 24, paddingTop: 8 },
    friendsCard: {
        marginHorizontal: 24,
        marginTop: 20,
        borderRadius: 16,
        overflow: 'hidden',
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        flexDirection: 'row',
    },
    friendsCardAccent: {
        width: 4,
        backgroundColor: '#6C3EF4',
    },
    friendsCardBody: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 16,
        paddingHorizontal: 16,
        gap: 14,
    },
    friendsCardIcon: {
        width: 44, height: 44, borderRadius: 22,
        backgroundColor: 'rgba(108, 62, 244, 0.2)',
        alignItems: 'center', justifyContent: 'center',
    },
    friendsCardTitle: {
        color: 'white',
        fontSize: 17,
        fontFamily: 'Inter_700Bold',
    },
    friendsCardSubtitle: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 13,
        fontFamily: 'Inter_500Medium',
        marginTop: 2,
    },
    friendsCardBadge: {
        backgroundColor: '#FF4D5F',
        minWidth: 22, height: 22, borderRadius: 11,
        paddingHorizontal: 6,
        alignItems: 'center', justifyContent: 'center',
        marginRight: 4,
    },
    friendsCardBadgeText: {
        color: 'white',
        fontSize: 12,
        fontFamily: 'Inter_700Bold',
    },
    wordmark: { fontFamily: 'Inter_900Black', fontSize: 36, letterSpacing: -0.5 },
    greeting: { color: colors.text60, fontSize: 14, fontFamily: 'Inter_400Regular', marginTop: 4 },

    sectionHeader: { ...typography.h2, color: 'white', marginBottom: 16, fontSize: 22 },

    partyCard: {
        backgroundColor: colors.glass,
        borderRadius: radii.lg,
        padding: 20,
        borderWidth: 1,
        borderColor: colors.glassBorder,
        marginBottom: 12,
    },
    partyHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    partyName: { color: 'white', fontFamily: 'Inter_700Bold', fontSize: 18, marginBottom: 4 },
    partyMeta: { color: colors.text60, fontSize: 13, fontFamily: 'Inter_400Regular' },

    statusPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radii.pill },
    statusText: { color: 'white', fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 0.5 },

    emptyCard: {
        backgroundColor: colors.glass,
        borderRadius: radii.lg,
        padding: 24,
        borderWidth: 1,
        borderColor: colors.glassBorder,
        alignItems: 'center',
    },
    emptyTitle: { color: 'white', fontFamily: 'Inter_700Bold', fontSize: 16, marginBottom: 6 },
    emptyBody: { color: colors.text60, fontSize: 13, textAlign: 'center', fontFamily: 'Inter_400Regular' },

    joinRow: { padding: 16, alignItems: 'center', marginTop: 8 },
    joinText: { color: colors.text60, fontSize: 14, fontFamily: 'Inter_500Medium' },

    fab: {
        position: 'absolute',
        bottom: 100,
        right: 24,
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.4,
        shadowRadius: 20,
        elevation: 12,
    },
    fabGradient: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },

    menuOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'flex-end',
    },
    menuSheet: {
        backgroundColor: colors.bg,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        borderWidth: 1,
        borderColor: colors.glassBorder,
        padding: 24,
        paddingBottom: 36,
    },
    menuTitle: {
        color: 'white',
        fontSize: 18,
        fontFamily: 'Inter_700Bold',
        marginBottom: 16,
    },
    menuRow: {
        paddingVertical: 16,
        borderTopWidth: 1,
        borderTopColor: colors.glassBorder,
    },
    menuDestructive: {
        color: '#FF4D5F',
        fontSize: 16,
        fontFamily: 'Inter_600SemiBold',
    },
    menuCancel: {
        color: colors.text60,
        fontSize: 16,
        fontFamily: 'Inter_500Medium',
    },
});
