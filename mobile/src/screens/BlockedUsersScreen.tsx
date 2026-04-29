import React, { useCallback, useMemo, useState } from 'react';
import {
    View, Text, StyleSheet, FlatList, TouchableOpacity,
    ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { ArrowLeft } from 'lucide-react-native';
import AvatarBubble from '../components/AvatarBubble';
import { api } from '../services/api';
import { useTheme } from '../context/ThemeContext';
import type { AppColors } from '../theme';
import { radii } from '../theme';

export default function BlockedUsersScreen() {
    const nav = useNavigation<any>();
    const { colors } = useTheme();
    const styles = useMemo(() => makeStyles(colors), [colors]);

    const [items, setItems] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [unblockBusy, setUnblockBusy] = useState<Record<string, boolean>>({});

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const data = await api.getBlockedUsers();
            setItems(data ?? []);
        } catch (e: any) {
            Alert.alert('Error', e?.message ?? 'Could not load blocked users');
        } finally {
            setLoading(false);
        }
    }, []);

    useFocusEffect(useCallback(() => { load(); }, [load]));

    const handleUnblock = (item: any) => {
        Alert.alert(
            'Unblock user?',
            `Unblock @${item.username ?? item.display_name}? They'll be able to follow you and see your profile again.`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Unblock',
                    onPress: async () => {
                        setUnblockBusy((b) => ({ ...b, [item.id]: true }));
                        try {
                            await api.unblockUser(item.id);
                            setItems((prev) => prev.filter((u) => u.id !== item.id));
                        } catch (e: any) {
                            Alert.alert('Error', e?.message ?? 'Try again');
                        } finally {
                            setUnblockBusy((b) => ({ ...b, [item.id]: false }));
                        }
                    },
                },
            ]
        );
    };

    const renderItem = ({ item }: { item: any }) => (
        <View style={styles.row}>
            <AvatarBubble
                name={item.display_name ?? '?'}
                color={item.avatar_color ?? undefined}
                avatarUrl={item.avatar_url}
                size={44}
            />
            <View style={styles.rowInfo}>
                <Text style={styles.rowName} numberOfLines={1}>{item.display_name ?? 'User'}</Text>
                {item.username ? <Text style={styles.rowUsername} numberOfLines={1}>@{item.username}</Text> : null}
            </View>
            <TouchableOpacity
                style={styles.unblockPill}
                onPress={() => handleUnblock(item)}
                disabled={unblockBusy[item.id]}
                activeOpacity={0.75}
            >
                {unblockBusy[item.id]
                    ? <ActivityIndicator size="small" color={colors.textPrimary} />
                    : <Text style={styles.unblockPillText}>Unblock</Text>
                }
            </TouchableOpacity>
        </View>
    );

    return (
        <View style={styles.root}>
            <SafeAreaView style={{ flex: 1 }} edges={['top']}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => nav.goBack()} style={styles.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <ArrowLeft size={22} color={colors.textPrimary} />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Blocked Users</Text>
                    <View style={{ width: 38 }} />
                </View>

                {loading ? (
                    <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
                ) : (
                    <FlatList
                        data={items}
                        keyExtractor={(item) => item.id}
                        renderItem={renderItem}
                        ListEmptyComponent={() => (
                            <View style={styles.empty}>
                                <Text style={styles.emptyText}>No blocked users.</Text>
                                <Text style={[styles.emptyText, { marginTop: 6, fontSize: 13 }]}>
                                    Block a user from their profile or from any follower list.
                                </Text>
                            </View>
                        )}
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
        row: {
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 16,
            paddingVertical: 12,
            gap: 12,
        },
        rowInfo: { flex: 1 },
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
        unblockPill: {
            paddingHorizontal: 14,
            paddingVertical: 6,
            borderRadius: 20,
            borderWidth: 1,
            borderColor: c.glassBorder,
            minWidth: 76,
            alignItems: 'center',
        },
        unblockPillText: {
            color: c.text80,
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
