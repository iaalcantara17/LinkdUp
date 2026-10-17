import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    TextInput, ActivityIndicator, Image, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ArrowLeft, UserPlus, UserCheck, UserX, Search, Users, Ban } from 'lucide-react-native';
import HelpButton from '../components/HelpButton';
import { LinearGradient } from 'expo-linear-gradient';
import { api } from '../services/api';
import { confirm, confirmBlock, errorText, showError } from '../components/dialogs';
import { radii } from '../theme';
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

    return (
        <View style={styles.root}>
            <SafeAreaView style={{ flex: 1 }} edges={['top']}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => nav.goBack()} style={styles.backBtn} activeOpacity={0.8}>
                        <ArrowLeft size={22} color={colors.textPrimary} />
                    </TouchableOpacity>
                    <Text style={styles.title}>Friends</Text>
                    <HelpButton items={FRIENDS_HELP} />
                </View>

                <View style={styles.tabBar}>
                    {(['friends', 'requests', 'search'] as FriendTab[]).map((tab) => (
                        <TouchableOpacity
                            key={tab}
                            style={[styles.tab, activeTab === tab && styles.tabActive]}
                            onPress={() => setActiveTab(tab)}
                            activeOpacity={0.8}
                        >
                            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                                {tab === 'friends' ? 'Friends' : tab === 'requests' ? `Requests${pending.length > 0 ? ` (${pending.length})` : ''}` : 'Search'}
                            </Text>
                        </TouchableOpacity>
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
                                <>
                                    <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
                                    <SlowLoadNote loading />
                                </>
                            ) : friendsView === 'empty' ? (
                                <Animated.View entering={FadeInDown.duration(400)} style={styles.emptyState}>
                                    <Text style={{ fontSize: 48, marginBottom: 12 }}>👋</Text>
                                    <Text style={styles.emptyTitle}>No friends yet</Text>
                                    <Text style={styles.emptyBody}>Search for people you know and send a friend request.</Text>
                                    <TouchableOpacity style={{ marginTop: 20, alignSelf: 'stretch' }} onPress={() => setActiveTab('search')} activeOpacity={0.8}>
                                        <LinearGradient colors={colors.gradient as any} style={{ paddingVertical: 14, borderRadius: radii.lg, alignItems: 'center' }}>
                                            <Text style={{ color: roles.onPrimary, fontFamily: 'Inter_700Bold', fontSize: 15 }}>Find Friends</Text>
                                        </LinearGradient>
                                    </TouchableOpacity>
                                </Animated.View>
                            ) : (
                                <View style={{ gap: 10 }}>
                                    {friends.map((f) => (
                                        <Animated.View key={f.id} entering={FadeInDown.duration(300)} style={styles.friendRow}>
                                            <Avatar user={f} colors={colors} />
                                            <View style={{ flex: 1, marginLeft: 12 }}>
                                                <Text style={styles.userName}>{f.display_name}</Text>
                                            </View>
                                            <TouchableOpacity
                                                onPress={() => handleRemoveFriend(f.id, f.display_name)}
                                                style={styles.iconBtn}
                                                activeOpacity={0.7}
                                                accessibilityRole="button"
                                                accessibilityLabel={`Remove ${f.display_name}`}
                                            >
                                                <UserX size={18} color={colors.text40} />
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                onPress={() => handleBlock(f)}
                                                style={[styles.iconBtn, { marginLeft: 8 }]}
                                                activeOpacity={0.7}
                                                accessibilityRole="button"
                                                accessibilityLabel={`Block ${f.display_name}`}
                                            >
                                                <Ban size={18} color={colors.text40} />
                                            </TouchableOpacity>
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
                                <>
                                    <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
                                    <SlowLoadNote loading />
                                </>
                            ) : pendingView === 'empty' ? (
                                <Animated.View entering={FadeInDown.duration(400)} style={styles.emptyState}>
                                    <Text style={{ fontSize: 48, marginBottom: 12 }}>📭</Text>
                                    <Text style={styles.emptyTitle}>No pending requests</Text>
                                    <Text style={styles.emptyBody}>When someone sends you a friend request it'll show here.</Text>
                                </Animated.View>
                            ) : (
                                <View style={{ gap: 10 }}>
                                    {pending.map((r) => (
                                        <Animated.View key={r.friendship_id} entering={FadeInDown.duration(300)} style={styles.friendRow}>
                                            <Avatar user={r.user ?? {}} colors={colors} />
                                            <View style={{ flex: 1, marginLeft: 12 }}>
                                                <Text style={styles.userName}>{r.user?.display_name ?? '?'}</Text>
                                                <Text style={styles.userSub}>Wants to be friends</Text>
                                            </View>
                                            <View style={{ flexDirection: 'row', gap: 8 }}>
                                                <TouchableOpacity onPress={() => handleDecline(r.friendship_id)} style={[styles.iconBtn, { backgroundColor: roles.dangerSoft }]} activeOpacity={0.7}>
                                                    <UserX size={18} color={colors.danger} />
                                                </TouchableOpacity>
                                                <TouchableOpacity onPress={() => handleAccept(r.friendship_id)} style={[styles.iconBtn, { backgroundColor: roles.primarySoft }]} activeOpacity={0.7}>
                                                    <UserCheck size={18} color={colors.primary} />
                                                </TouchableOpacity>
                                            </View>
                                        </Animated.View>
                                    ))}
                                </View>
                            )}
                        </>
                    )}

                    {activeTab === 'search' && (
                        <>
                            <View style={styles.searchBox}>
                                <Search size={16} color={colors.text40} />
                                <TextInput
                                    style={styles.searchInput}
                                    placeholder="Search by name or @username"
                                    placeholderTextColor={colors.text30}
                                    value={searchQ}
                                    onChangeText={setSearchQ}
                                    autoFocus
                                    returnKeyType="search"
                                />
                                {searching && <ActivityIndicator color={colors.primary} size="small" />}
                            </View>

                            {searchResults.length > 0 && (
                                <View style={{ gap: 10, marginTop: 12 }}>
                                    {searchResults.map((u) => {
                                        const fs = u.friendship;
                                        const isFriend = fs?.status === 'accepted';
                                        const isPending = fs?.status === 'pending';
                                        return (
                                            <Animated.View key={u.id} entering={FadeInDown.duration(250)} style={styles.friendRow}>
                                                <Avatar user={u} colors={colors} />
                                                <View style={{ flex: 1, marginLeft: 12 }}>
                                                    <Text style={styles.userName}>{u.display_name}</Text>
                                                    {u.username ? <Text style={styles.userSub}>@{u.username}</Text> : null}
                                                    {isFriend && <Text style={[styles.userSub, { color: colors.success }]}>Friends ✓</Text>}
                                                    {isPending && <Text style={[styles.userSub, { color: colors.text40 }]}>Request sent</Text>}
                                                </View>
                                                {!isFriend && !isPending && (
                                                    <TouchableOpacity onPress={() => handleSendRequest(u.id)} style={[styles.iconBtn, { backgroundColor: roles.primarySoft }]} activeOpacity={0.7}>
                                                        <UserPlus size={18} color={colors.primary} />
                                                    </TouchableOpacity>
                                                )}
                                            </Animated.View>
                                        );
                                    })}
                                </View>
                            )}

                            {!searching && searchQ.length > 0 && searchResults.length === 0 && (
                                <Text style={styles.noResults}>No users found for "{searchQ}"</Text>
                            )}

                            {!searchQ && (
                                <View style={styles.emptyState}>
                                    <Users size={40} color={colors.text30} />
                                    <Text style={[styles.emptyBody, { marginTop: 12 }]}>Type a name to find people you know.</Text>
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
        header: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 16,
            paddingTop: 8,
            paddingBottom: 12,
        },
        backBtn: {
            width: 40, height: 40,
            borderRadius: 20,
            backgroundColor: c.glass,
            alignItems: 'center', justifyContent: 'center',
        },
        title: { color: c.textPrimary, fontFamily: 'Inter_900Black', fontSize: 22 },
        tabBar: { flexDirection: 'row', paddingHorizontal: 20, gap: 8, marginBottom: 4 },
        tab: {
            flex: 1,
            paddingVertical: 10,
            borderRadius: radii.pill,
            backgroundColor: c.glass,
            alignItems: 'center',
            borderWidth: 1,
            borderColor: c.glassBorder,
        },
        tabActive: { backgroundColor: c.primary, borderColor: c.primary },
        tabText: { color: c.text60, fontFamily: 'Inter_600SemiBold', fontSize: 13 },
        tabTextActive: { color: r.onPrimary },
        friendRow: {
            flexDirection: 'row',
            alignItems: 'center',
            padding: 14,
            borderRadius: 14,
            backgroundColor: c.glass,
            borderWidth: 1,
            borderColor: c.glassBorder,
        },
        userName: { color: c.textPrimary, fontFamily: 'Inter_600SemiBold', fontSize: 15 },
        userSub: { color: c.text40, fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 2 },
        iconBtn: {
            width: 44, height: 44,
            borderRadius: 22,
            backgroundColor: c.glass,
            alignItems: 'center', justifyContent: 'center',
        },
        searchBox: {
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: c.glass,
            borderRadius: 12,
            paddingHorizontal: 14,
            paddingVertical: 12,
            gap: 10,
            borderWidth: 1,
            borderColor: c.glassBorder,
        },
        searchInput: { flex: 1, color: c.textPrimary, fontFamily: 'Inter_400Regular', fontSize: 15 },
        noResults: { color: c.text40, fontFamily: 'Inter_400Regular', fontSize: 14, textAlign: 'center', marginTop: 32 },
        emptyState: { alignItems: 'center', paddingTop: 48, paddingHorizontal: 16 },
        emptyTitle: { color: c.textPrimary, fontFamily: 'Inter_700Bold', fontSize: 20, marginBottom: 8 },
        emptyBody: { color: c.text60, fontFamily: 'Inter_400Regular', fontSize: 14, textAlign: 'center', lineHeight: 20 },
    });
}
