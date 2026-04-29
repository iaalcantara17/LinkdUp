import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    View, Text, StyleSheet, FlatList, TouchableOpacity,
    ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { ArrowLeft } from 'lucide-react-native';
import AvatarBubble from '../components/AvatarBubble';
import { api } from '../services/api';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import type { AppColors } from '../theme';
import { radii } from '../theme';
import type { MainStackParamList } from '../navigation/MainStack';

type RouteT = RouteProp<MainStackParamList, 'FollowList'>;

export default function FollowListScreen() {
    const nav = useNavigation<any>();
    const route = useRoute<RouteT>();
    const { userId, initialTab, username } = route.params;
    const { colors } = useTheme();
    const { user: authUser } = useAuth();
    const styles = useMemo(() => makeStyles(colors), [colors]);

    const [activeTab, setActiveTab] = useState<'followers' | 'following'>(initialTab);
    const [items, setItems] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [actionBusy, setActionBusy] = useState<Record<string, boolean>>({});

    const isOwn = authUser?.id === userId;

    const load = useCallback(async (tab: 'followers' | 'following') => {
        setLoading(true);
        setItems([]);
        try {
            const data = tab === 'followers'
                ? await api.getFollowers(userId, { limit: 50 })
                : await api.getFollowing(userId, { limit: 50 });
            setItems(data ?? []);
        } catch (e: any) {
            Alert.alert('Error', e?.message ?? 'Could not load list');
        } finally {
            setLoading(false);
        }
    }, [userId]);

    useEffect(() => { load(activeTab); }, [activeTab, load]);

    const switchTab = (tab: 'followers' | 'following') => {
        if (tab === activeTab) return;
        setActiveTab(tab);
    };

    const handleRemoveFollower = async (item: any) => {
        Alert.alert(
            'Remove follower?',
            "Remove this follower? They'll have to follow you again.",
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Remove',
                    style: 'destructive',
                    onPress: async () => {
                        setActionBusy((b) => ({ ...b, [item.id]: true }));
                        try {
                            await api.removeFollower(item.id);
                            setItems((prev) => prev.filter((u) => u.id !== item.id));
                        } catch (e: any) {
                            Alert.alert('Error', e?.message ?? 'Try again');
                        } finally {
                            setActionBusy((b) => ({ ...b, [item.id]: false }));
                        }
                    },
                },
            ]
        );
    };

    const handleUnfollow = async (item: any) => {
        setActionBusy((b) => ({ ...b, [item.id]: true }));
        try {
            await api.unfollowUser(item.id);
            setItems((prev) => prev.map((u) => u.id === item.id ? { ...u, follows_back: false } : u));
        } catch (e: any) {
            Alert.alert('Error', e?.message ?? 'Try again');
        } finally {
            setActionBusy((b) => ({ ...b, [item.id]: false }));
        }
    };

    const handleFollow = async (item: any) => {
        setActionBusy((b) => ({ ...b, [item.id]: true }));
        try {
            await api.followUser(item.id);
            setItems((prev) => prev.map((u) => u.id === item.id ? { ...u, follows_back: true } : u));
        } catch (e: any) {
            Alert.alert('Error', e?.message ?? 'Try again');
        } finally {
            setActionBusy((b) => ({ ...b, [item.id]: false }));
        }
    };

    const handleBlock = async (item: any) => {
        Alert.alert(
            'Block user?',
            `Block @${item.username ?? item.display_name}? They won't be able to follow you or see your profile.`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Block',
                    style: 'destructive',
                    onPress: async () => {
                        setActionBusy((b) => ({ ...b, [item.id]: true }));
                        try {
                            await api.blockUser(item.id);
                            setItems((prev) => prev.filter((u) => u.id !== item.id));
                        } catch (e: any) {
                            Alert.alert('Error', e?.message ?? 'Try again');
                        } finally {
                            setActionBusy((b) => ({ ...b, [item.id]: false }));
                        }
                    },
                },
            ]
        );
    };

    const handleLongPress = (item: any) => {
        const options: Array<{ text: string; onPress?: () => void; style?: 'cancel' | 'destructive' | 'default' }> = [
            { text: 'View profile', onPress: () => nav.navigate('UserProfile', { userId: item.id }) },
            { text: 'Block', style: 'destructive', onPress: () => handleBlock(item) },
        ];
        if (isOwn && activeTab === 'followers') {
            options.push({ text: 'Remove follower', style: 'destructive', onPress: () => handleRemoveFollower(item) });
        }
        options.push({ text: 'Cancel', style: 'cancel' });

        Alert.alert(item.display_name ?? 'User', undefined, options);
    };

    const renderActionButton = (item: any) => {
        const busy = actionBusy[item.id];

        if (item.is_blocked) {
            return (
                <View style={styles.mutedPill}>
                    <Text style={styles.mutedPillText}>Blocked</Text>
                </View>
            );
        }

        if (isOwn) {
            if (activeTab === 'followers') {
                return (
                    <TouchableOpacity
                        style={styles.removePill}
                        onPress={() => handleRemoveFollower(item)}
                        disabled={busy}
                        activeOpacity={0.75}
                    >
                        {busy ? <ActivityIndicator size="small" color={colors.danger} /> : <Text style={styles.removePillText}>Remove</Text>}
                    </TouchableOpacity>
                );
            } else {
                return (
                    <TouchableOpacity
                        style={styles.removePill}
                        onPress={() => handleUnfollow(item)}
                        disabled={busy}
                        activeOpacity={0.75}
                    >
                        {busy ? <ActivityIndicator size="small" color={colors.danger} /> : <Text style={styles.removePillText}>Unfollow</Text>}
                    </TouchableOpacity>
                );
            }
        }

        if (item.follows_back) {
            return (
                <TouchableOpacity
                    style={styles.followingPill}
                    onPress={() => handleUnfollow(item)}
                    disabled={busy}
                    activeOpacity={0.75}
                >
                    {busy ? <ActivityIndicator size="small" color="white" /> : <Text style={styles.followingPillText}>Following</Text>}
                </TouchableOpacity>
            );
        }

        return (
            <TouchableOpacity
                style={styles.followPill}
                onPress={() => handleFollow(item)}
                disabled={busy}
                activeOpacity={0.75}
            >
                {busy ? <ActivityIndicator size="small" color={colors.primary} /> : <Text style={styles.followPillText}>Follow</Text>}
            </TouchableOpacity>
        );
    };

    const renderEmpty = () => {
        if (loading) return null;
        const msg = isOwn
            ? activeTab === 'followers'
                ? "When people follow you, they'll show up here."
                : "Find friends in the Discover feed and follow their posts."
            : activeTab === 'followers'
                ? "No followers yet."
                : "Not following anyone yet.";
        return (
            <View style={styles.empty}>
                <Text style={styles.emptyText}>{msg}</Text>
            </View>
        );
    };

    const renderItem = ({ item }: { item: any }) => (
        <TouchableOpacity
            style={styles.row}
            onLongPress={() => handleLongPress(item)}
            activeOpacity={0.85}
            delayLongPress={400}
        >
            <AvatarBubble
                name={item.display_name ?? '?'}
                color={item.avatar_color ?? undefined}
                avatarUrl={item.avatar_url}
                size={40}
            />
            <View style={styles.rowInfo}>
                <Text style={styles.rowName} numberOfLines={1}>{item.display_name ?? 'User'}</Text>
                {item.username ? <Text style={styles.rowUsername} numberOfLines={1}>@{item.username}</Text> : null}
            </View>
            <View style={styles.rowAction}>
                {renderActionButton(item)}
            </View>
        </TouchableOpacity>
    );

    return (
        <View style={styles.root}>
            <SafeAreaView style={{ flex: 1 }} edges={['top']}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => nav.goBack()} style={styles.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <ArrowLeft size={22} color={colors.textPrimary} />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle} numberOfLines={1}>
                        {username ? `@${username}` : 'Users'}
                    </Text>
                    <View style={{ width: 38 }} />
                </View>

                <View style={styles.tabBar}>
                    <TouchableOpacity
                        style={[styles.tab, activeTab === 'followers' && styles.tabActive]}
                        onPress={() => switchTab('followers')}
                        activeOpacity={0.75}
                    >
                        <Text style={[styles.tabText, activeTab === 'followers' && styles.tabTextActive]}>Followers</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.tab, activeTab === 'following' && styles.tabActive]}
                        onPress={() => switchTab('following')}
                        activeOpacity={0.75}
                    >
                        <Text style={[styles.tabText, activeTab === 'following' && styles.tabTextActive]}>Following</Text>
                    </TouchableOpacity>
                </View>

                {loading ? (
                    <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
                ) : (
                    <FlatList
                        data={items}
                        keyExtractor={(item) => item.id}
                        renderItem={renderItem}
                        ListEmptyComponent={renderEmpty}
                        contentContainerStyle={items.length === 0 ? { flex: 1 } : { paddingBottom: 40 }}
                        showsVerticalScrollIndicator={false}
                    />
                )}
            </SafeAreaView>
        </View>
    );
}

function makeStyles(c: AppColors) {
    return StyleSheet.create({
        root: { flex: 1, backgroundColor: c.bg },
        header: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 16,
            paddingVertical: 12,
        },
        backBtn: {
            width: 38,
            height: 38,
            alignItems: 'center',
            justifyContent: 'center',
        },
        headerTitle: {
            color: c.textPrimary,
            fontFamily: 'Inter_700Bold',
            fontSize: 17,
            flex: 1,
            textAlign: 'center',
        },
        tabBar: {
            flexDirection: 'row',
            marginHorizontal: 16,
            marginBottom: 8,
            backgroundColor: c.glass,
            borderRadius: radii.lg,
            borderWidth: 1,
            borderColor: c.glassBorder,
            padding: 4,
        },
        tab: {
            flex: 1,
            paddingVertical: 8,
            borderRadius: radii.md,
            alignItems: 'center',
        },
        tabActive: {
            backgroundColor: c.primary,
        },
        tabText: {
            color: c.text60,
            fontFamily: 'Inter_600SemiBold',
            fontSize: 14,
        },
        tabTextActive: {
            color: 'white',
        },
        row: {
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 16,
            paddingVertical: 12,
            gap: 12,
        },
        rowInfo: {
            flex: 1,
        },
        rowName: {
            color: c.textPrimary,
            fontFamily: 'Inter_600SemiBold',
            fontSize: 15,
        },
        rowUsername: {
            color: c.text40,
            fontFamily: 'Inter_400Regular',
            fontSize: 13,
            marginTop: 1,
        },
        rowAction: {
            alignItems: 'flex-end',
        },
        removePill: {
            paddingHorizontal: 14,
            paddingVertical: 6,
            borderRadius: 20,
            borderWidth: 1,
            borderColor: c.danger,
            minWidth: 80,
            alignItems: 'center',
        },
        removePillText: {
            color: c.danger,
            fontFamily: 'Inter_600SemiBold',
            fontSize: 13,
        },
        followPill: {
            paddingHorizontal: 14,
            paddingVertical: 6,
            borderRadius: 20,
            borderWidth: 1,
            borderColor: c.primary,
            minWidth: 80,
            alignItems: 'center',
        },
        followPillText: {
            color: c.primary,
            fontFamily: 'Inter_600SemiBold',
            fontSize: 13,
        },
        followingPill: {
            paddingHorizontal: 14,
            paddingVertical: 6,
            borderRadius: 20,
            backgroundColor: c.primary,
            minWidth: 80,
            alignItems: 'center',
        },
        followingPillText: {
            color: 'white',
            fontFamily: 'Inter_600SemiBold',
            fontSize: 13,
        },
        mutedPill: {
            paddingHorizontal: 14,
            paddingVertical: 6,
            borderRadius: 20,
            backgroundColor: c.glass,
            borderWidth: 1,
            borderColor: c.glassBorder,
            minWidth: 80,
            alignItems: 'center',
        },
        mutedPillText: {
            color: c.text40,
            fontFamily: 'Inter_600SemiBold',
            fontSize: 13,
        },
        empty: {
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 32,
        },
        emptyText: {
            color: c.text60,
            fontFamily: 'Inter_400Regular',
            fontSize: 15,
            textAlign: 'center',
            lineHeight: 22,
        },
    });
}
