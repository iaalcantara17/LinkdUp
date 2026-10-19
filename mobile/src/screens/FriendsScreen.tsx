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
import { UserPlus, UserX, Search, Users, Ban } from '../components/icons';
import HelpButton from '../components/HelpButton';
import UserProfileSheet from '../components/UserProfileSheet';
import { api } from '../services/api';
import { confirm, confirmBlock, errorText, showError } from '../components/dialogs';
import { typeScale } from '../theme';
import type { AppColors, ColorRoles } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { listView } from '../hooks/listView';
import { LoadError, SlowLoadNote } from '../components/LoadState';

const FRIENDS_HELP: { title: string; description: string }[] = [
    { title: 'Friends tab', description: 'People you follow who follow you back.' },
    { title: 'Follow back tab', description: "People who follow you that you don't follow yet." },
    { title: 'Search', description: 'Find people by name or @username and follow them.' },
];

type FriendTab = 'friends' | 'followBack' | 'search';

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
    const [followBack, setFollowBack] = useState<any[]>([]);
    const [loadingFollowBack, setLoadingFollowBack] = useState(true);
    const [followBackError, setFollowBackError] = useState<unknown>(null);
    const [searchQ, setSearchQ] = useState('');
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [searching, setSearching] = useState(false);
    const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const [profileUserId, setProfileUserId] = useState<string | null>(null);

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

    const loadFollowBack = useCallback(async () => {
        setLoadingFollowBack(true);
        try {
            const data = await api.getFollowBack();
            setFollowBack(data ?? []);
            setFollowBackError(null);
        } catch (e) {
            setFollowBackError(e);
        }
        finally { setLoadingFollowBack(false); }
    }, []);

    useEffect(() => {
        loadFriends();
        loadFollowBack();
    }, [loadFriends, loadFollowBack]);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await Promise.allSettled([loadFriends(), loadFollowBack()]);
        setRefreshing(false);
    }, [loadFriends, loadFollowBack]);

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

    const handleFollowBack = async (userId: string) => {
        try {
            await api.followUser(userId);
            setFollowBack((prev) => prev.filter((u) => u.id !== userId));
            await loadFriends();
        } catch (e: any) { showError("Couldn't follow back", errorText(e, 'Try again in a moment.')); }
    };

    const handleUnfollow = async (userId: string, name: string) => {
        const ok = await confirm({
            title: `Unfollow ${name}?`,
            message: "You won't be friends anymore.",
            confirmLabel: 'Unfollow',
            destructive: true,
        });
        if (!ok) return;
        try {
            await api.unfollowUser(userId);
            setFriends((prev) => prev.filter((f) => f.id !== userId));
        } catch (e: any) { showError("Couldn't unfollow", errorText(e, 'Try again in a moment.')); }
    };

    const handleBlock = async (f: any) => {
        if (!(await confirmBlock(f))) return;
        try {
            await api.blockUser(f.id);
            setFriends((prev) => prev.filter((x) => x.id !== f.id));
        } catch (e: any) { showError("Couldn't block this person", errorText(e, 'Try again in a moment.')); }
    };

    const handleFollow = async (userId: string) => {
        try {
            await api.followUser(userId);
            setSearchResults((prev) => prev.map((u) => (u.id === userId ? { ...u, i_follow: true } : u)));
        } catch (e: any) { showError("Couldn't follow", errorText(e, 'Try again in a moment.')); }
    };

    const friendsView = listView(friends, loadingFriends);
    const followBackView = listView(followBack, loadingFollowBack);

    const enter = useEntering();
    const loadingRows = (label: string) => (
        <>
            <SkeletonList count={3} height={76} label={label} />
            <SlowLoadNote loading />
        </>
    );

    const tabLabel = (tab: FriendTab) =>
        tab === 'friends' ? 'Friends' : tab === 'followBack' ? `Follow back${followBack.length > 0 ? ` (${followBack.length})` : ''}` : 'Search';

    return (
        <View style={styles.root}>
            <SafeAreaView style={{ flex: 1 }} edges={['top']}>
                <ScreenHeader title="Friends" onBack={() => nav.goBack()} right={<HelpButton items={FRIENDS_HELP} />} />

                <View style={styles.tabBar}>
                    {(['friends', 'followBack', 'search'] as FriendTab[]).map((tab) => (
                        <Chip
                            key={tab}
                            label={tabLabel(tab)}
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
                                    body="Follow people you know. When they follow you back, they'll show up here."
                                    action={<GradientButton title="Find Friends" size="md" onPress={() => setActiveTab('search')} />}
                                />
                            ) : (
                                <View style={{ gap: 12 }}>
                                    {friends.map((f, i) => (
                                        <Animated.View key={f.id} entering={enter(i)}>
                                            <ListRow
                                                left={<Avatar user={f} colors={colors} />}
                                                title={f.display_name}
                                                onPress={() => setProfileUserId(f.id)}
                                                pressLabel={`View ${f.display_name}'s profile`}
                                                right={
                                                    <View style={styles.actions}>
                                                        <IconButton label={`Unfollow ${f.display_name}`} onPress={() => handleUnfollow(f.id, f.display_name)}>
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

                    {activeTab === 'followBack' && (
                        <>
                            {followBackError && followBack.length === 0 && !loadingFollowBack ? (
                                <LoadError title="We couldn't load people to follow back" error={followBackError} onRetry={loadFollowBack} />
                            ) : followBackView === 'loading' ? (
                                loadingRows('Loading people to follow back')
                            ) : followBackView === 'empty' ? (
                                <EmptyState
                                    emoji="📭"
                                    title="No one to follow back"
                                    body="When someone follows you, they'll show up here."
                                />
                            ) : (
                                <View style={{ gap: 12 }}>
                                    {followBack.map((u, i) => (
                                        <Animated.View key={u.id} entering={enter(i)}>
                                            <ListRow
                                                left={<Avatar user={u} colors={colors} />}
                                                title={u.display_name}
                                                subtitle="Follows you"
                                                onPress={() => setProfileUserId(u.id)}
                                                pressLabel={`View ${u.display_name}'s profile`}
                                                right={
                                                    <IconButton tone="primary" label={`Follow back ${u.display_name}`} onPress={() => handleFollowBack(u.id)}>
                                                        <UserPlus size={18} color={colors.primary} />
                                                    </IconButton>
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
                                        const isFriend = u.i_follow && u.follows_me;
                                        return (
                                            <Animated.View key={u.id} entering={enter(i, 'fast')}>
                                                <ListRow
                                                    left={<Avatar user={u} colors={colors} />}
                                                    title={u.display_name}
                                                    onPress={() => setProfileUserId(u.id)}
                                                    pressLabel={`View ${u.display_name}'s profile`}
                                                    subtitle={
                                                        <>
                                                            {u.username ? <Text style={styles.userSub}>@{u.username}</Text> : null}
                                                            {isFriend ? (
                                                                <Text style={[styles.userSub, { color: colors.success }]}>Friends ✓</Text>
                                                            ) : u.i_follow ? (
                                                                <Text style={styles.userSub}>Following</Text>
                                                            ) : u.follows_me ? (
                                                                <Text style={styles.userSub}>Follows you</Text>
                                                            ) : null}
                                                        </>
                                                    }
                                                    right={
                                                        !u.i_follow ? (
                                                            <IconButton
                                                                tone="primary"
                                                                label={`${u.follows_me ? 'Follow back' : 'Follow'} ${u.display_name}`}
                                                                onPress={() => handleFollow(u.id)}
                                                            >
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
            <UserProfileSheet
                userId={profileUserId}
                visible={!!profileUserId}
                onClose={() => {
                    setProfileUserId(null);
                    loadFriends();
                    loadFollowBack();
                }}
            />
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
