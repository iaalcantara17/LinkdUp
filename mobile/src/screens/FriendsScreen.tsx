import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    View, Text, StyleSheet, ScrollView,
    ActivityIndicator, Image, RefreshControl,
} from 'react-native';
import { Chip, EmptyState, IconButton, ListRow, ScreenHeader, SkeletonList, TextField, useEntering } from '../components/kit';
import GradientButton from '../components/GradientButton';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Animated from 'react-native-reanimated';
import { UserPlus, UserCheck, UserX, Search, Users, Ban } from '../components/icons';
import HelpButton from '../components/HelpButton';
import { api } from '../services/api';
import { confirm, confirmBlock, errorText, showError } from '../components/dialogs';
import { typeScale } from '../theme';
import type { AppColors, ColorRoles } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { listView } from '../hooks/listView';
import { LoadError, SlowLoadNote } from '../components/LoadState';

const FRIENDS_HELP: { title: string; description: string }[] = [
    { title: 'Friends tab', description: 'See everyone you\'ve accepted.' },
    { title: 'Requests tab', description: 'Accept or decline friend requests.' },
    { title: 'Search', description: 'Find people by name or email to send a request.' },
];

type FriendTab = 'friends' | 'requests' | 'search';

function Avatar({ user, colors }: { user: any; colors: AppColors }) {
    const { roles } = useTheme();
    const initials = (user.display_name ?? '?').slice(0, 2).toUpperCase();
    if (user.avatar_url) {
        return <Image source={{ uri: user.avatar_url }} style={{ width: 44, height: 44, borderRadius: 22 }} />;
    }
    return (
        <View style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: user.avatar_color ?? colors.primary }}>
            <Text style={{ color: roles.onPrimary, fontFamily: 'Inter_700Bold', fontSize: 15 }}>{initials}</Text>
        </View>
    );
}

export default function FriendsScreen() {
    const nav = useNavigation<any>();
    const { colors, roles } = useTheme();
    const styles = useMemo(() => makeStyles(colors, roles), [colors, roles]);

    const [activeTab, setActiveTab] = useState<FriendTab>('friends');
    const [friends, setFriends] = useState<any[]>([]);
    const [loadingFriends, setLoadingFriends] = useState(true);
    const [friendsError, setFriendsError] = useState<unknown>(null);
    const [pending, setPending] = useState<any[]>([]);
    const [loadingPending, setLoadingPending] = useState(true);
    const [pendingError, setPendingError] = useState<unknown>(null);
    const [searchQ, setSearchQ] = useState('');
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [searching, setSearching] = useState(false);
    const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [refreshing, setRefreshing] = useState(false);

    const loadFriends = useCallback(async () => {
        setLoadingFriends(true);
        try {
            const data = await api.getFriends();
            setFriends(data ?? []);
            setFriendsError(null);
        } catch (e) {
            setFriendsError(e);
        }
        finally { setLoadingFriends(false); }
    }, []);

    const loadPending = useCallback(async () => {
        setLoadingPending(true);
        try {
            const data = await api.getPendingRequests();
            setPending(data ?? []);
            setPendingError(null);
        } catch (e) {
            setPendingError(e);
        }
        finally { setLoadingPending(false); }
    }, []);

    useEffect(() => {
        loadFriends();
        loadPending();
    }, [loadFriends, loadPending]);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await Promise.allSettled([loadFriends(), loadPending()]);
        setRefreshing(false);
    }, [loadFriends, loadPending]);

    useEffect(() => {
        if (searchTimeout.current) clearTimeout(searchTimeout.current);
        if (!searchQ.trim()) { setSearchResults([]); return; }
        searchTimeout.current = setTimeout(async () => {
            setSearching(true);
            try {
                const res = await api.searchFriends(searchQ.trim());
                setSearchResults(res ?? []);
            } catch { setSearchResults([]); }
            finally { setSearching(false); }
        }, 400);
    }, [searchQ]);

    const handleAccept = async (friendshipId: string) => {
        try {
            await api.acceptFriendRequest(friendshipId);
            setPending((prev) => prev.filter((r) => r.friendship_id !== friendshipId));
            await loadFriends();
        } catch (e: any) { showError("Couldn't accept request", errorText(e, 'Try again in a moment.')); }
    };

    const handleDecline = async (friendshipId: string) => {
        try {
            await api.declineFriendRequest(friendshipId);
            setPending((prev) => prev.filter((r) => r.friendship_id !== friendshipId));
        } catch (e: any) { showError("Couldn't decline request", errorText(e, 'Try again in a moment.')); }
    };

    const handleRemoveFriend = async (userId: string, name: string) => {
        const ok = await confirm({
            title: `Remove ${name}?`,
            message: "They'll be removed from your friends.",
            confirmLabel: 'Remove',
            destructive: true,
        });
        if (!ok) return;
        try {
            await api.removeFriend(userId);
            setFriends((prev) => prev.filter((f) => f.id !== userId));
        } catch (e: any) { showError("Couldn't remove friend", errorText(e, 'Try again in a moment.')); }
    };

    const handleBlock = async (f: any) => {
        if (!(await confirmBlock(f))) return;
        try {
            await api.blockUser(f.id);
            setFriends((prev) => prev.filter((x) => x.id !== f.id));
        } catch (e: any) { showError("Couldn't block this person", errorText(e, 'Try again in a moment.')); }
    };

    const handleSendRequest = async (userId: string) => {
        try {
            await api.sendFriendRequest(userId);
            setSearchResults((prev) =>
                prev.map((u) => u.id === userId
                    ? { ...u, friendship: { status: 'pending', direction: 'outgoing' } }
                    : u
                )
            );
        } catch (e: any) { showError("Couldn't send friend request", errorText(e, 'Try again in a moment.')); }
    };

    const friendsView = listView(friends, loadingFriends);
    const pendingView = listView(pending, loadingPending);

    const enter = useEntering();
    const loadingRows = (label: string) => (
        <>
            <SkeletonList count={3} height={76} label={label} />
            <SlowLoadNote loading />
        </>
    );

    return (
        <View style={styles.root}>
            <SafeAreaView style={{ flex: 1 }} edges={['top']}>
                <ScreenHeader title="Friends" onBack={() => nav.goBack()} right={<HelpButton items={FRIENDS_HELP} />} />

                <View style={styles.tabBar}>
                    {(['friends', 'requests', 'search'] as FriendTab[]).map((tab) => (
                        <Chip
                            key={tab}
                            label={tab === 'friends' ? 'Friends' : tab === 'requests' ? `Requests${pending.length > 0 ? ` (${pending.length})` : ''}` : 'Search'}
                            selected={activeTab === tab}
                            onPress={() => setActiveTab(tab)}
                            style={{ flex: 1 }}
                        />
                    ))}
                </View>

                <ScrollView
                    contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 60, paddingTop: 12 }}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.text60} />}
                    keyboardShouldPersistTaps="handled"
                >
                    {activeTab === 'friends' && (
                        <>
                            {friendsError && friends.length === 0 && !loadingFriends ? (
                                <LoadError title="We couldn't load your friends" error={friendsError} onRetry={loadFriends} />
                            ) : friendsView === 'loading' ? (
                                loadingRows('Loading friends')
                            ) : friendsView === 'empty' ? (
                                <EmptyState
                                    emoji="👋"
                                    title="No friends yet"
                                    body="Search for people you know and send a friend request."
                                    action={<GradientButton title="Find Friends" size="md" onPress={() => setActiveTab('search')} />}
                                />
                            ) : (
                                <View style={{ gap: 12 }}>
                                    {friends.map((f, i) => (
                                        <Animated.View key={f.id} entering={enter(i)}>
                                            <ListRow
                                                left={<Avatar user={f} colors={colors} />}
                                                title={f.display_name}
                                                right={
                                                    <View style={styles.actions}>
                                                        <IconButton label={`Remove ${f.display_name}`} onPress={() => handleRemoveFriend(f.id, f.display_name)}>
                                                            <UserX size={18} color={colors.text40} />
                                                        </IconButton>
                                                        <IconButton label={`Block ${f.display_name}`} onPress={() => handleBlock(f)}>
                                                            <Ban size={18} color={colors.text40} />
                                                        </IconButton>
                                                    </View>
                                                }
                                            />
                                        </Animated.View>
                                    ))}
                                </View>
                            )}
                        </>
                    )}

                    {activeTab === 'requests' && (
                        <>
                            {pendingError && pending.length === 0 && !loadingPending ? (
                                <LoadError title="We couldn't load your friend requests" error={pendingError} onRetry={loadPending} />
                            ) : pendingView === 'loading' ? (
                                loadingRows('Loading friend requests')
                            ) : pendingView === 'empty' ? (
                                <EmptyState
                                    emoji="📭"
                                    title="No pending requests"
                                    body="When someone sends you a friend request it'll show here."
                                />
                            ) : (
                                <View style={{ gap: 12 }}>
                                    {pending.map((r, i) => (
                                        <Animated.View key={r.friendship_id} entering={enter(i)}>
                                            <ListRow
                                                left={<Avatar user={r.user ?? {}} colors={colors} />}
                                                title={r.user?.display_name ?? '?'}
                                                subtitle="Wants to be friends"
                                                right={
                                                    <View style={styles.actions}>
                                                        <IconButton tone="danger" label={`Decline ${r.user?.display_name ?? 'request'}`} onPress={() => handleDecline(r.friendship_id)}>
                                                            <UserX size={18} color={colors.danger} />
                                                        </IconButton>
                                                        <IconButton tone="primary" label={`Accept ${r.user?.display_name ?? 'request'}`} onPress={() => handleAccept(r.friendship_id)}>
                                                            <UserCheck size={18} color={colors.primary} />
                                                        </IconButton>
                                                    </View>
                                                }
                                            />
                                        </Animated.View>
                                    ))}
                                </View>
                            )}
                        </>
                    )}

                    {activeTab === 'search' && (
                        <>
                            <TextField
                                left={<Search size={16} color={colors.text40} />}
                                right={searching ? <ActivityIndicator color={colors.primary} size="small" /> : null}
                                placeholder="Search by name or @username"
                                accessibilityLabel="Search by name or @username"
                                value={searchQ}
                                onChangeText={setSearchQ}
                                autoFocus
                                returnKeyType="search"
                            />

                            {searchResults.length > 0 && (
                                <View style={{ gap: 12, marginTop: 12 }}>
                                    {searchResults.map((u, i) => {
                                        const fs = u.friendship;
                                        const isFriend = fs?.status === 'accepted';
                                        const isPending = fs?.status === 'pending';
                                        return (
                                            <Animated.View key={u.id} entering={enter(i, 'fast')}>
                                                <ListRow
                                                    left={<Avatar user={u} colors={colors} />}
                                                    title={u.display_name}
                                                    subtitle={
                                                        <>
                                                            {u.username ? <Text style={styles.userSub}>@{u.username}</Text> : null}
                                                            {isFriend && <Text style={[styles.userSub, { color: colors.success }]}>Friends ✓</Text>}
                                                            {isPending && <Text style={styles.userSub}>Request sent</Text>}
                                                        </>
                                                    }
                                                    right={
                                                        !isFriend && !isPending ? (
                                                            <IconButton tone="primary" label={`Send friend request to ${u.display_name}`} onPress={() => handleSendRequest(u.id)}>
                                                                <UserPlus size={18} color={colors.primary} />
                                                            </IconButton>
                                                        ) : null
                                                    }
                                                />
                                            </Animated.View>
                                        );
                                    })}
                                </View>
                            )}

                            {!searching && searchQ.length > 0 && searchResults.length === 0 && (
                                <Text style={styles.noResults}>No users found for "{searchQ}"</Text>
                            )}

                            {!searchQ && (
                                <View style={styles.searchHint}>
                                    <Users size={40} color={colors.textMuted} />
                                    <Text style={styles.emptyBody}>Type a name to find people you know.</Text>
                                </View>
                            )}
                        </>
                    )}
                </ScrollView>
            </SafeAreaView>
        </View>
    );
}

function makeStyles(c: AppColors, r: ColorRoles) {
    return StyleSheet.create({
        root: { flex: 1, backgroundColor: c.bg },
        tabBar: { flexDirection: 'row', paddingHorizontal: 20, gap: 8, marginTop: 8, marginBottom: 4 },
        actions: { flexDirection: 'row', gap: 8 },
        userSub: { ...typeScale.caption, color: c.text40 },
        noResults: { ...typeScale.footnote, color: c.text40, textAlign: 'center', marginTop: 32 },
        searchHint: { alignItems: 'center', paddingTop: 48, paddingHorizontal: 16, gap: 12 },
        emptyBody: { ...typeScale.footnote, color: r.textMuted, textAlign: 'center' },
    });
}
