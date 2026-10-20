import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    View, Text, StyleSheet, ScrollView, Pressable,
    Modal, Image, RefreshControl,
} from 'react-native';
import { EmptyState, SkeletonList, Tap } from '../components/kit';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
    FadeInDown, FadeIn, FadeInLeft,
    withDelay, withSpring, withTiming,
    useSharedValue, useAnimatedStyle,
} from 'react-native-reanimated';
import { Plus, MoreVertical, Users, ChevronRight } from '../components/icons';
import BottomNav from '../components/BottomNav';
import HelpButton from '../components/HelpButton';
import AnchoredHint from '../components/AnchoredHint';
import UserProfileSheet from '../components/UserProfileSheet';
import { api, MyLocation } from '../services/api';
import { latestOnly } from '../hooks/latestOnly';
import { takeJoin, webSession } from '../services/joinLink';
import { listView } from '../hooks/listView';
import { locationSourceLabel } from '../services/locationChoice';
import DialogHost from '../components/DialogHost';
import { LoadError, SlowLoadNote } from '../components/LoadState';
import { confirm, errorText, showError } from '../components/dialogs';
import { typography, radii, motion, stagger } from '../theme';
import type { AppColors, ColorRoles } from '../theme';
import { useTheme } from '../context/ThemeContext';

const HOME_HELP: { title: string; description: string }[] = [
    { title: 'Your parties', description: 'Rejoin any party you\'ve created or accepted.' },
    { title: 'Create a party', description: 'Tap the + button to start a new meetup.' },
    { title: 'Find friends', description: 'Open the Friends card to find people, follow them, and follow back.' },
];

interface MemberAvatar {
    avatar_url: string | null;
    avatar_color: string | null;
    initial: string;
}

interface PartyRow {
    id: string;
    name: string;
    code: string;
    status: 'waiting' | 'swiping' | 'matched' | 'scheduled' | 'done';
    host_user_id: string;
    matched_location_id: string | null;
    member_count: number;
    total_votes: number;
    venue_count: number;
    member_avatars: MemberAvatar[];
    my_location?: MyLocation;
}

function StackedAvatars({ avatars, colors }: { avatars: MemberAvatar[]; colors: AppColors }) {
    const { roles: r } = useTheme();
    return (
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {avatars.map((a, i) => (
                <View
                    key={i}
                    style={[
                        { borderRadius: 16, borderWidth: 2, borderColor: colors.bg, overflow: 'hidden' },
                        i > 0 && { marginLeft: -8 },
                    ]}
                >
                    {a.avatar_url ? (
                        <Image source={{ uri: a.avatar_url }} style={{ width: 32, height: 32, borderRadius: 14 }} />
                    ) : (
                        <View style={{ width: 32, height: 32, borderRadius: 14, backgroundColor: a.avatar_color ?? colors.primary, alignItems: 'center', justifyContent: 'center' }}>
                            <Text style={{ color: r.onPrimary, fontFamily: 'Inter_700Bold', fontSize: 11 }}>{a.initial}</Text>
                        </View>
                    )}
                </View>
            ))}
        </View>
    );
}

function PartyProgressBar({ totalVotes, memberCount, venueCount, colors }: {
    totalVotes: number;
    memberCount: number;
    venueCount: number;
    colors: AppColors;
}) {
    const total = memberCount * venueCount;
    const progress = total > 0 ? Math.min(totalVotes / total, 1) : 0;
    const [trackWidth, setTrackWidth] = useState(0);
    const widthAnim = useSharedValue(0);

    useEffect(() => {
        if (trackWidth > 0) {
            widthAnim.value = withTiming(trackWidth * progress, { duration: motion.base });
        }
    }, [trackWidth, progress]);

    const fillStyle = useAnimatedStyle(() => ({ width: widthAnim.value }));
    const swiped = total > 0 ? `${totalVotes}/${total} swiped` : '0 swiped';

    return (
        <View style={{ marginTop: 12 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                <Text style={{ color: colors.text60, fontSize: 12, fontFamily: 'Inter_500Medium' }}>Voting Progress</Text>
                <Text style={{ color: colors.text40, fontSize: 12, fontFamily: 'Inter_400Regular' }}>{swiped}</Text>
            </View>
            <View
                style={{ height: 6, borderRadius: 3, backgroundColor: colors.glass, overflow: 'hidden' }}
                onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
            >
                <Animated.View style={[{ height: 6, borderRadius: 3, overflow: 'hidden' }, fillStyle]}>
                    <LinearGradient
                        colors={colors.gradient as any}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={StyleSheet.absoluteFill}
                    />
                </Animated.View>
            </View>
        </View>
    );
}

function PartyCard({ party, onPress, onMenuPress, colors }: { party: PartyRow; onPress: () => void; onMenuPress: () => void; colors: AppColors }) {
    const { roles: r } = useTheme();
    const isMatched = party.status === 'matched' || party.status === 'scheduled';
    const isSwiping = party.status === 'swiping';

    return (
        <Pressable
            onPress={onPress}
            style={({ pressed }) => [
                { backgroundColor: colors.glass, borderRadius: 24, padding: 20, borderWidth: 1, borderColor: colors.glassBorder, marginBottom: 12 },
                pressed && { opacity: 0.85 },
            ]}
        >
            <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.textPrimary, fontFamily: 'Inter_700Bold', fontSize: 18, marginBottom: 4 }} numberOfLines={1}>{party.name}</Text>
                    <Text style={{ color: colors.text60, fontSize: 13, fontFamily: 'Inter_400Regular' }}>
                        {party.member_count} {party.member_count === 1 ? 'member' : 'members'}
                    </Text>
                    <Text
                        style={{ color: colors.text60, fontSize: 13, fontFamily: 'Inter_400Regular', marginTop: 4 }}
                        numberOfLines={1}
                        accessibilityLabel={`Your location for this party: ${locationSourceLabel(party.my_location).replace('Custom: ', 'Custom, ')}`}
                    >
                        Your location: {locationSourceLabel(party.my_location)}
                    </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    {isMatched && (
                        <View style={{ paddingHorizontal: 12, paddingVertical: 4, borderRadius: radii.pill, backgroundColor: r.successFill }}>
                            <Text style={{ color: r.onPrimary, fontFamily: 'Inter_900Black', fontSize: 11 }}>MATCHED! 🎉</Text>
                        </View>
                    )}
                    <Tap
                        onPress={(e) => { e.stopPropagation?.(); onMenuPress(); }}
                        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                        style={{ padding: 8, zIndex: 10 }}
                        activeOpacity={0.6}
                    >
                        <MoreVertical size={18} color={colors.text60} />
                    </Tap>
                </View>
            </View>
            {party.member_avatars.length > 0 && (
                <View style={{ marginTop: 8 }}>
                    <StackedAvatars avatars={party.member_avatars} colors={colors} />
                </View>
            )}
            {isSwiping && (
                <PartyProgressBar
                    totalVotes={party.total_votes}
                    memberCount={party.member_count}
                    venueCount={party.venue_count}
                    colors={colors}
                />
            )}
        </Pressable>
    );
}

function OnlineFriendBubble({ friend, onPress, index, colors }: { friend: any; onPress: () => void; index: number; colors: AppColors }) {
    const { roles: r } = useTheme();
    const name: string = friend.display_name ?? '?';
    const initials = name.slice(0, 2).toUpperCase();

    return (
        <Animated.View entering={FadeIn.delay(stagger(index, false)).duration(motion.base)} style={{ alignItems: 'center', width: 64 }}>
            <Tap onPress={onPress} activeOpacity={0.8} accessibilityLabel={`View ${name}'s profile`} style={{ alignItems: 'center' }}>
                <View style={{ position: 'relative', width: 64, height: 64 }}>
                    {friend.avatar_url ? (
                        <Image source={{ uri: friend.avatar_url }} style={{ width: 64, height: 64, borderRadius: 32, borderWidth: 2, borderColor: colors.glassBorder }} />
                    ) : (
                        <View style={{ width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.glassBorder, backgroundColor: friend.avatar_color ?? colors.primary }}>
                            <Text style={{ color: r.onPrimary, fontFamily: 'Inter_700Bold', fontSize: 18 }}>{initials}</Text>
                        </View>
                    )}
                    <View style={{ position: 'absolute', bottom: 1, right: 1, width: 16, height: 16, borderRadius: 8, backgroundColor: r.success, borderWidth: 2, borderColor: colors.bg }} />
                </View>
                <Text style={{ color: colors.text60, fontSize: 12, fontFamily: 'Inter_500Medium', marginTop: 8, textAlign: 'center', maxWidth: 64 }} numberOfLines={1}>{name.split(' ')[0]}</Text>
            </Tap>
        </Animated.View>
    );
}

function AnimatedFAB({ onPress, colors }: { onPress: () => void; colors: AppColors }) {
    const { roles: r } = useTheme();
    const scale = useSharedValue(0);

    useEffect(() => {
        scale.value = withDelay(300, withSpring(1, { damping: 12, stiffness: 180 }));
    }, []);

    const fabStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

    return (
        <Animated.View style={[{ position: 'absolute', bottom: 96, right: 24, borderRadius: 32, shadowColor: colors.primary, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.45, shadowRadius: 20, elevation: 12 }, fabStyle]}>
            <Tap activeOpacity={0.85} onPress={onPress} style={{ width: 64, height: 64, borderRadius: 32, overflow: 'hidden', backgroundColor: 'transparent' }}>
                <LinearGradient
                    colors={colors.gradient as any}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={{ width: 64, height: 64, alignItems: 'center', justifyContent: 'center' }}
                >
                    <Plus size={28} color={r.onPrimary} strokeWidth={3} />
                </LinearGradient>
            </Tap>
        </Animated.View>
    );
}

export default function HomeScreen() {
    const nav = useNavigation<any>();
    const { colors, roles, syncFromProfile } = useTheme();
    const styles = useMemo(() => makeStyles(colors, roles), [colors, roles]);

    const [parties, setParties] = useState<PartyRow[]>([]);
    const [partiesLoaded, setPartiesLoaded] = useState(false);
    const [loadError, setLoadError] = useState<unknown>(null);
    const [onlineFriends, setOnlineFriends] = useState<any[]>([]);
    const [refreshing, setRefreshing] = useState(false);
    const [me, setMe] = useState<any>(null);
    const [menuParty, setMenuParty] = useState<PartyRow | null>(null);
    const [displayParty, setDisplayParty] = useState<PartyRow | null>(null);
    const [followBackCount, setFollowBackCount] = useState(0);
    const [profileUserId, setProfileUserId] = useState<string | null>(null);
    const walkthroughCheckedRef = useRef(false);
    const friendsCardRef = useRef<View>(null);
    const [latestLoad] = useState(() => latestOnly());

    const load = useCallback(async () => {
        const isLatest = latestLoad();
        let partiesError: unknown = null;
        try {
            const [myProfile, myParties, followBack, friends] = await Promise.all([
                api.me().catch(() => null),
                api.myParties().catch((e) => { partiesError = e; return null; }),
                api.getFollowBack().catch(() => []),
                api.getFriends().catch(() => []),
            ]);
            if (!isLatest()) return;
            if (myProfile) {
                setMe(myProfile);
                if (myProfile.theme_preference) {
                    syncFromProfile(myProfile.theme_preference);
                }
                if (!walkthroughCheckedRef.current) {
                    walkthroughCheckedRef.current = true;
                    if (!myProfile.has_seen_walkthrough && myProfile.display_name) {
                        nav.replace('Walkthrough', { fromSignup: true });
                        return;
                    }
                }
            }
            setLoadError(partiesError);
            if (!partiesError) {
                setParties(myParties ?? []);
                setPartiesLoaded(true);
            }
            setFollowBackCount((followBack ?? []).length);
            setOnlineFriends((friends ?? []).filter((f: any) => f.is_online).slice(0, 5));
        } catch {}
    }, [syncFromProfile, latestLoad]);

    useFocusEffect(useCallback(() => { load(); }, [load]));

    useEffect(() => {
        const code = takeJoin(webSession());
        if (code) nav.navigate('JoinParty', { code });
    }, []);

    const retryLoad = useCallback(() => {
        setLoadError(null);
        load();
    }, [load]);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await load();
        setRefreshing(false);
    }, [load]);

    const openPartyMenu = (party: PartyRow) => {
        setDisplayParty(party);
        setMenuParty(party);
    };

    const closePartyMenu = () => {
        setMenuParty(null);
        setTimeout(() => setDisplayParty(null), 300);
    };

    const confirmDelete = async (party: PartyRow) => {
        const ok = await confirm({
            title: `Delete "${party.name}"?`,
            message: "This can't be undone.",
            confirmLabel: 'Delete',
            destructive: true,
        });
        setMenuParty(null);
        if (!ok) return;
        try {
            await api.deleteParty(party.id);
            setParties(ps => ps.filter(p => p.id !== party.id));
            latestLoad();
        } catch (e: any) {
            showError("Couldn't delete party", errorText(e, 'Try again in a moment.'));
        }
    };

    const confirmLeave = async (party: PartyRow) => {
        const ok = await confirm({
            title: `Leave "${party.name}"?`,
            message: "You'll be removed from this party.",
            confirmLabel: 'Leave',
            destructive: true,
        });
        setMenuParty(null);
        if (!ok) return;
        try {
            await api.leaveParty(party.id);
            setParties(ps => ps.filter(p => p.id !== party.id));
            latestLoad();
        } catch (e: any) {
            showError("Couldn't leave party", errorText(e, 'Try again in a moment.'));
        }
    };

    const routeForParty = (p: PartyRow) => {
        if (p.status === 'matched' || p.status === 'scheduled' || p.status === 'done') {
            return { screen: 'Match', params: { partyId: p.id } };
        }
        if (p.status === 'swiping') return { screen: 'Swipe', params: { partyId: p.id } };
        return { screen: 'PartyLobby', params: { partyId: p.id } };
    };

    const activeParties = parties.filter(p => p.status !== 'done');
    const partiesView = listView(activeParties, !partiesLoaded);

    return (
        <View style={styles.root}>
            <SafeAreaView style={{ flex: 1 }} edges={['top']}>
                <ScrollView
                    contentContainerStyle={{ paddingBottom: 160 }}
                    showsVerticalScrollIndicator={false}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.text60} />}
                >
                    <Animated.View entering={FadeInDown.duration(motion.base)} style={styles.header}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                            <Text style={[styles.wordmark, { color: colors.primary }]}>LINKDUP</Text>
                            <HelpButton items={HOME_HELP} />
                        </View>
                        <Text style={styles.greeting}>
                            {me?.display_name ? `Hey ${me.display_name}! 👋` : 'Hey there! 👋'}
                        </Text>
                    </Animated.View>

                    {onlineFriends.length > 0 && (
                        <Animated.View entering={FadeInDown.delay(motion.instant).duration(motion.base)} style={{ marginTop: 24 }}>
                            <Text style={styles.sectionLabel}>Online Alumni</Text>
                            <ScrollView
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                contentContainerStyle={{ paddingHorizontal: 24, gap: 16, paddingVertical: 4 }}
                            >
                                {onlineFriends.map((f, i) => (
                                    <OnlineFriendBubble
                                        key={f.id}
                                        friend={f}
                                        index={i}
                                        colors={colors}
                                        onPress={() => setProfileUserId(f.id)}
                                    />
                                ))}
                            </ScrollView>
                        </Animated.View>
                    )}

                    <View ref={friendsCardRef}>
                        <Tap
                            onPress={() => nav.navigate('Friends')}
                            style={styles.friendsCard}
                            activeOpacity={0.85}
                        >
                            <View style={styles.friendsCardAccent} />
                            <View style={styles.friendsCardBody}>
                                <View style={styles.friendsCardIcon}>
                                    <Users size={22} color={roles.primaryText} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.friendsCardTitle}>Friends</Text>
                                    <Text style={styles.friendsCardSubtitle}>
                                        {followBackCount > 0
                                            ? `${followBackCount} ${followBackCount === 1 ? 'person' : 'people'} to follow back`
                                            : 'Find and follow friends'}
                                    </Text>
                                </View>
                                {followBackCount > 0 && (
                                    <View style={styles.friendsCardBadge}>
                                        <Text style={styles.friendsCardBadgeText}>
                                            {followBackCount > 9 ? '9+' : followBackCount}
                                        </Text>
                                    </View>
                                )}
                                <ChevronRight size={20} color={colors.text40} />
                            </View>
                        </Tap>
                    </View>

                    <View style={{ marginTop: 32, paddingHorizontal: 24 }}>
                        <Text style={styles.sectionHeader}>Your Active Parties</Text>

                        {loadError && !partiesLoaded ? (
                            <LoadError title="We couldn't load your parties" error={loadError} onRetry={retryLoad} />
                        ) : partiesView === 'loading' ? (
                            <>
                                <SkeletonList count={2} height={144} round={radii.xl} label="Loading your parties" />
                                <SlowLoadNote loading />
                            </>
                        ) : partiesView === 'empty' ? (
                            <EmptyState card title="No parties yet" body="Tap the + button below to create your first party, or join one with a code." />
                        ) : (
                            activeParties.map((party, i) => {
                                const target = routeForParty(party);
                                return (
                                    <Animated.View key={party.id} entering={FadeInLeft.delay(stagger(i, false)).duration(motion.base)}>
                                        <PartyCard
                                            party={party}
                                            colors={colors}
                                            onPress={() => nav.navigate(target.screen, target.params)}
                                            onMenuPress={() => openPartyMenu(party)}
                                        />
                                    </Animated.View>
                                );
                            })
                        )}

                        <Tap
                            style={{ padding: 16, alignItems: 'center', marginTop: 8 }}
                            onPress={() => nav.navigate('JoinParty')}
                            activeOpacity={0.8}
                        >
                            <Text style={{ color: colors.text60, fontSize: 14, fontFamily: 'Inter_500Medium' }}>Have a code? Join a party →</Text>
                        </Tap>
                    </View>
                </ScrollView>
            </SafeAreaView>

            <AnimatedFAB onPress={() => nav.navigate('CreateParty')} colors={colors} />

            <AnchoredHint
                screenKey="home_friends_card"
                title="Find your friends"
                body="Tap here anytime to find people from your school, follow them, and follow back anyone who follows you."
                targetRef={friendsCardRef}
                placement="bottom"
            />
            <BottomNav />

            <Modal
                visible={menuParty !== null}
                transparent
                animationType="fade"
                onRequestClose={closePartyMenu}
            >
                <Pressable style={styles.menuOverlay} onPress={closePartyMenu}>
                    <View style={styles.menuSheet}>
                        <Text style={styles.menuTitle}>
                            {displayParty?.name ?? 'Party options'}
                        </Text>
                        {displayParty?.host_user_id === me?.id ? (
                            <Tap
                                style={styles.menuRow}
                                onPress={() => displayParty && confirmDelete(displayParty)}
                                activeOpacity={0.7}
                            >
                                <Text style={styles.menuDestructive}>Delete party</Text>
                            </Tap>
                        ) : (
                            <Tap
                                style={styles.menuRow}
                                onPress={() => displayParty && confirmLeave(displayParty)}
                                activeOpacity={0.7}
                            >
                                <Text style={styles.menuDestructive}>Leave party</Text>
                            </Tap>
                        )}
                        <Tap style={styles.menuRow} onPress={closePartyMenu} activeOpacity={0.7}>
                            <Text style={styles.menuCancel}>Cancel</Text>
                        </Tap>
                    </View>
                </Pressable>
                <DialogHost />
            </Modal>
            <UserProfileSheet
                userId={profileUserId}
                visible={!!profileUserId}
                onClose={() => {
                    setProfileUserId(null);
                    load();
                }}
            />
        </View>
    );
}

function makeStyles(c: AppColors, r: ColorRoles) {
    return StyleSheet.create({
        root: { flex: 1, backgroundColor: c.bg },
        header: { paddingHorizontal: 24, paddingTop: 8 },
        wordmark: { fontFamily: 'Inter_900Black', fontSize: 36, letterSpacing: -0.5 },
        greeting: { color: c.text60, fontSize: 14, fontFamily: 'Inter_400Regular', marginTop: 4 },
        sectionLabel: {
            color: c.text60,
            fontSize: 12,
            fontFamily: 'Inter_700Bold',
            letterSpacing: 1,
            textTransform: 'uppercase',
            paddingHorizontal: 24,
            marginBottom: 12,
        },
        friendsCard: {
            marginHorizontal: 24,
            marginTop: 20,
            borderRadius: 16,
            overflow: 'hidden',
            backgroundColor: c.glass,
            borderWidth: 1,
            borderColor: c.glassBorder,
            flexDirection: 'row',
        },
        friendsCardAccent: { width: 4, backgroundColor: r.primary },
        friendsCardBody: {
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            paddingVertical: 16,
            paddingHorizontal: 16,
            gap: 16,
        },
        friendsCardIcon: {
            width: 44, height: 44, borderRadius: 22,
            backgroundColor: r.primarySoft,
            alignItems: 'center', justifyContent: 'center',
        },
        friendsCardTitle: { color: c.textPrimary, fontSize: 17, fontFamily: 'Inter_700Bold' },
        friendsCardSubtitle: { color: c.text60, fontSize: 13, fontFamily: 'Inter_500Medium', marginTop: 4 },
        friendsCardBadge: {
            backgroundColor: r.dangerStrong,
            minWidth: 22, height: 22, borderRadius: 11,
            paddingHorizontal: 8,
            alignItems: 'center', justifyContent: 'center',
            marginRight: 4,
        },
        friendsCardBadgeText: { color: r.onPrimary, fontSize: 12, fontFamily: 'Inter_700Bold' },
        sectionHeader: { ...typography.h2, color: c.textPrimary, marginBottom: 16, fontSize: 20 },
        menuOverlay: { flex: 1, backgroundColor: r.scrim, justifyContent: 'flex-end' },
        menuSheet: {
            backgroundColor: c.bg,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            borderWidth: 1,
            borderColor: c.glassBorder,
            padding: 24,
            paddingBottom: 36,
        },
        menuTitle: { color: c.textPrimary, fontSize: 18, fontFamily: 'Inter_700Bold', marginBottom: 16 },
        menuRow: { paddingVertical: 16, borderTopWidth: 1, borderTopColor: c.glassBorder },
        menuDestructive: { color: r.danger, fontSize: 16, fontFamily: 'Inter_600SemiBold' },
        menuCancel: { color: c.text60, fontSize: 16, fontFamily: 'Inter_500Medium' },
    });
}
