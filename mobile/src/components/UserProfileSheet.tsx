import React, { useEffect, useMemo, useState } from 'react';
import {
    View, Text, StyleSheet, Modal, TouchableOpacity,
    ActivityIndicator, ScrollView, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { X, GraduationCap, UserPlus, UserCheck, Clock, MoreHorizontal } from 'lucide-react-native';
import AvatarBubble from './AvatarBubble';
import { api } from '../services/api';
import { radii } from '../theme';
import type { AppColors } from '../theme';
import { useTheme } from '../context/ThemeContext';

interface PublicUser {
    id: string;
    display_name: string;
    username: string | null;
    avatar_url: string | null;
    avatar_color: string | null;
    school: string | null;
    graduation_year: number | null;
    pronouns: string | null;
    age: number | null;
    bio: string | null;
    follower_count?: number;
    following_count?: number;
    is_blocked_by_me?: boolean;
}

interface Props {
    userId: string | null;
    visible: boolean;
    onClose: () => void;
}

type FriendUi = 'loading' | 'self' | 'none' | 'pending_out' | 'pending_in' | 'accepted';

export default function UserProfileSheet({ userId, visible, onClose }: Props) {
    const { colors } = useTheme();
    const styles = useMemo(() => makeStyles(colors), [colors]);
    const nav = useNavigation<any>();

    const [profile, setProfile] = useState<PublicUser | null>(null);
    const [loading, setLoading] = useState(false);
    const [blockedByThem, setBlockedByThem] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [friendUi, setFriendUi] = useState<FriendUi>('loading');
    const [friendshipId, setFriendshipId] = useState<string | null>(null);
    const [friendBusy, setFriendBusy] = useState(false);
    const [myId, setMyId] = useState<string | null>(null);
    const [blockBusy, setBlockBusy] = useState(false);

    useEffect(() => {
        if (!visible || !userId) return;
        let cancelled = false;
        setProfile(null);
        setError(null);
        setBlockedByThem(false);
        setLoading(true);
        setFriendUi('loading');
        setFriendshipId(null);
        setMyId(null);

        api.getPublicUser(userId)
            .then((data) => { if (!cancelled) setProfile(data); })
            .catch((e: any) => {
                if (cancelled) return;
                if (e?.message === 'blocked') {
                    setBlockedByThem(true);
                } else {
                    setError('Could not load profile');
                }
            })
            .finally(() => { if (!cancelled) setLoading(false); });

        api.me()
            .then((me) => {
                if (cancelled || !userId) return;
                setMyId(me?.id ?? null);
                if (me?.id === userId) {
                    setFriendUi('self');
                    return;
                }
                return api.getFriendStatus(userId).then((s: any) => {
                    if (cancelled) return;
                    if (s.status === 'self') setFriendUi('self');
                    else if (s.status === 'accepted') {
                        setFriendUi('accepted');
                        setFriendshipId(s.friendship_id ?? null);
                    } else if (s.status === 'pending') {
                        setFriendshipId(s.friendship_id ?? null);
                        setFriendUi(s.direction === 'outgoing' ? 'pending_out' : 'pending_in');
                    } else {
                        setFriendUi('none');
                    }
                });
            })
            .catch(() => { if (!cancelled) setFriendUi('none'); });

        return () => { cancelled = true; };
    }, [userId, visible]);

    const isSelf = friendUi === 'self';

    const handleBlock = () => {
        if (!userId || !profile) return;
        Alert.alert(
            'Block user?',
            `Block @${profile.username ?? profile.display_name}? They won't be able to follow you or see your profile.`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Block',
                    style: 'destructive',
                    onPress: async () => {
                        setBlockBusy(true);
                        try {
                            await api.blockUser(userId);
                            onClose();
                        } catch (e: any) {
                            Alert.alert('Error', e?.message ?? 'Try again');
                        } finally {
                            setBlockBusy(false);
                        }
                    },
                },
            ]
        );
    };

    const handleKebab = () => {
        if (!profile) return;
        const options: any[] = [
            {
                text: 'Block user',
                style: 'destructive',
                onPress: handleBlock,
            },
            {
                text: 'Report user',
                onPress: () => Alert.alert('Thanks', "We'll review this report."),
            },
            { text: 'Cancel', style: 'cancel' },
        ];
        Alert.alert(profile.display_name ?? 'User', undefined, options);
    };

    const navigateToFollowList = (tab: 'followers' | 'following') => {
        if (!userId || !profile) return;
        onClose();
        setTimeout(() => {
            nav.navigate('FollowList', {
                userId,
                initialTab: tab,
                username: profile.username ?? undefined,
            });
        }, 300);
    };

    const name = profile?.display_name ?? '';
    const hasMeta = profile?.pronouns || profile?.age !== null;
    const hasSchool = profile?.school || profile?.graduation_year;

    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            onRequestClose={onClose}
        >
            <View style={styles.overlay}>
                <SafeAreaView style={styles.sheet} edges={['bottom']}>
                    <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.8}>
                        <X size={18} color="white" />
                    </TouchableOpacity>

                    {profile && !isSelf && !blockedByThem && (
                        <TouchableOpacity style={styles.kebabBtn} onPress={handleKebab} activeOpacity={0.8} disabled={blockBusy}>
                            {blockBusy
                                ? <ActivityIndicator size="small" color="white" />
                                : <MoreHorizontal size={18} color="white" />
                            }
                        </TouchableOpacity>
                    )}

                    <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
                        {loading ? (
                            <ActivityIndicator color={colors.primary} style={{ paddingVertical: 48 }} />
                        ) : blockedByThem ? (
                            <View style={styles.unavailableWrap}>
                                <Text style={styles.unavailableName}>This profile is unavailable</Text>
                                <Text style={styles.unavailableSub}>You can't view this profile right now.</Text>
                                <TouchableOpacity onPress={onClose} style={styles.backPill} activeOpacity={0.75}>
                                    <Text style={styles.backPillText}>Go back</Text>
                                </TouchableOpacity>
                            </View>
                        ) : error ? (
                            <Text style={styles.errorText}>{error}</Text>
                        ) : profile ? (
                            <>
                                <View style={styles.avatarWrap}>
                                    <AvatarBubble
                                        name={name}
                                        color={profile.avatar_color ?? undefined}
                                        avatarUrl={profile.avatar_url}
                                        size={80}
                                    />
                                </View>

                                <Text style={styles.name}>{name}</Text>
                                {profile.username ? (
                                    <Text style={styles.username}>@{profile.username}</Text>
                                ) : null}

                                {(profile.follower_count != null || profile.following_count != null) && (
                                    <View style={styles.countsRow}>
                                        <TouchableOpacity
                                            style={styles.countPill}
                                            onPress={() => navigateToFollowList('followers')}
                                            activeOpacity={0.75}
                                        >
                                            <Text style={styles.countNum}>{profile.follower_count ?? 0}</Text>
                                            <Text style={styles.countLabel}>Followers</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={styles.countPill}
                                            onPress={() => navigateToFollowList('following')}
                                            activeOpacity={0.75}
                                        >
                                            <Text style={styles.countNum}>{profile.following_count ?? 0}</Text>
                                            <Text style={styles.countLabel}>Following</Text>
                                        </TouchableOpacity>
                                    </View>
                                )}

                                {hasMeta && (
                                    <Text style={styles.meta}>
                                        {[profile.pronouns, profile.age !== null ? `${profile.age} y/o` : null]
                                            .filter(Boolean)
                                            .join('  ·  ')}
                                    </Text>
                                )}

                                {hasSchool && (
                                    <View style={styles.infoRow}>
                                        <GraduationCap size={14} color={colors.text40} />
                                        <Text style={styles.infoText}>
                                            {[profile.school, profile.graduation_year ? `'${String(profile.graduation_year).slice(-2)}` : null]
                                                .filter(Boolean)
                                                .join(' · ')}
                                        </Text>
                                    </View>
                                )}

                                {profile.bio ? (
                                    <View style={styles.bioBox}>
                                        <Text style={styles.bioText}>{profile.bio}</Text>
                                    </View>
                                ) : null}

                                {friendUi !== 'self' && friendUi !== 'loading' && (
                                    <View style={{ marginTop: 20, alignSelf: 'stretch' }}>
                                        {friendUi === 'none' && (
                                            <TouchableOpacity
                                                style={styles.friendBtn}
                                                disabled={friendBusy}
                                                onPress={async () => {
                                                    if (!userId) return;
                                                    setFriendBusy(true);
                                                    try {
                                                        await api.sendFriendRequest(userId);
                                                        setFriendUi('pending_out');
                                                    } catch (e: any) {
                                                        Alert.alert('Request failed', e?.message ?? 'Try again');
                                                    } finally {
                                                        setFriendBusy(false);
                                                    }
                                                }}
                                            >
                                                <UserPlus size={18} color="white" />
                                                <Text style={styles.friendBtnText}>Add friend</Text>
                                            </TouchableOpacity>
                                        )}
                                        {friendUi === 'pending_out' && (
                                            <View style={styles.friendPending}>
                                                <Clock size={16} color={colors.text60} />
                                                <Text style={styles.friendPendingText}>Request pending</Text>
                                            </View>
                                        )}
                                        {friendUi === 'pending_in' && friendshipId && (
                                            <TouchableOpacity
                                                style={styles.friendBtn}
                                                disabled={friendBusy}
                                                onPress={async () => {
                                                    setFriendBusy(true);
                                                    try {
                                                        await api.acceptFriendRequest(friendshipId);
                                                        setFriendUi('accepted');
                                                    } catch (e: any) {
                                                        Alert.alert('Could not accept', e?.message ?? '');
                                                    } finally {
                                                        setFriendBusy(false);
                                                    }
                                                }}
                                            >
                                                <UserCheck size={18} color="white" />
                                                <Text style={styles.friendBtnText}>Accept request</Text>
                                            </TouchableOpacity>
                                        )}
                                        {friendUi === 'accepted' && (
                                            <View style={styles.friendOk}>
                                                <UserCheck size={16} color={colors.success} />
                                                <Text style={styles.friendOkText}>Friends</Text>
                                            </View>
                                        )}
                                    </View>
                                )}
                            </>
                        ) : null}
                    </ScrollView>
                </SafeAreaView>
            </View>
        </Modal>
    );
}

function makeStyles(c: AppColors) {
    return StyleSheet.create({
        overlay: {
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.65)',
            justifyContent: 'flex-end',
        },
        sheet: {
            backgroundColor: c.bg,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            borderTopWidth: 1,
            borderColor: c.glassBorder,
            minHeight: 280,
            paddingBottom: 24,
        },
        closeBtn: {
            position: 'absolute',
            top: 16,
            right: 56,
            width: 34,
            height: 34,
            borderRadius: 17,
            backgroundColor: c.glassStrong,
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10,
        },
        kebabBtn: {
            position: 'absolute',
            top: 16,
            right: 16,
            width: 34,
            height: 34,
            borderRadius: 17,
            backgroundColor: c.glassStrong,
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10,
        },
        body: {
            paddingHorizontal: 24,
            paddingTop: 32,
            paddingBottom: 16,
            alignItems: 'center',
        },
        avatarWrap: { marginBottom: 14 },
        name: {
            color: c.textPrimary,
            fontFamily: 'Inter_900Black',
            fontSize: 22,
            textAlign: 'center',
            marginBottom: 2,
        },
        username: {
            color: c.text40,
            fontFamily: 'Inter_400Regular',
            fontSize: 13,
            textAlign: 'center',
            marginBottom: 6,
        },
        countsRow: {
            flexDirection: 'row',
            gap: 10,
            marginTop: 10,
            marginBottom: 10,
        },
        countPill: {
            alignItems: 'center',
            paddingHorizontal: 18,
            paddingVertical: 8,
            borderRadius: 16,
            backgroundColor: c.glass,
            borderWidth: 1,
            borderColor: c.glassBorder,
        },
        countNum: {
            color: c.textPrimary,
            fontFamily: 'Inter_700Bold',
            fontSize: 16,
        },
        countLabel: {
            color: c.text60,
            fontFamily: 'Inter_400Regular',
            fontSize: 12,
        },
        meta: {
            color: c.text60,
            fontFamily: 'Inter_400Regular',
            fontSize: 14,
            textAlign: 'center',
            marginBottom: 10,
        },
        infoRow: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            marginBottom: 16,
        },
        infoText: {
            color: c.text60,
            fontSize: 13,
            fontFamily: 'Inter_400Regular',
        },
        bioBox: {
            backgroundColor: c.glass,
            borderRadius: radii.lg,
            borderWidth: 1,
            borderColor: c.glassBorder,
            padding: 14,
            alignSelf: 'stretch',
            marginTop: 4,
        },
        bioText: {
            color: c.text80,
            fontSize: 14,
            fontFamily: 'Inter_400Regular',
            lineHeight: 20,
            textAlign: 'center',
        },
        errorText: {
            color: c.text40,
            fontSize: 14,
            fontFamily: 'Inter_400Regular',
            textAlign: 'center',
            paddingVertical: 48,
        },
        unavailableWrap: {
            alignItems: 'center',
            paddingVertical: 40,
        },
        unavailableName: {
            color: c.textPrimary,
            fontFamily: 'Inter_700Bold',
            fontSize: 18,
            textAlign: 'center',
            marginBottom: 8,
        },
        unavailableSub: {
            color: c.text60,
            fontFamily: 'Inter_400Regular',
            fontSize: 14,
            textAlign: 'center',
            marginBottom: 24,
        },
        backPill: {
            paddingHorizontal: 20,
            paddingVertical: 10,
            borderRadius: 20,
            borderWidth: 1,
            borderColor: c.glassBorder,
        },
        backPillText: {
            color: c.text80,
            fontFamily: 'Inter_600SemiBold',
            fontSize: 14,
        },
        friendBtn: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            backgroundColor: c.primary,
            borderRadius: radii.md,
            paddingVertical: 12,
        },
        friendBtnText: { color: 'white', fontFamily: 'Inter_700Bold', fontSize: 15 },
        friendPending: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            paddingVertical: 12,
            borderRadius: radii.md,
            borderWidth: 1,
            borderColor: c.glassBorder,
        },
        friendPendingText: { color: c.text60, fontFamily: 'Inter_600SemiBold', fontSize: 14 },
        friendOk: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            paddingVertical: 12,
        },
        friendOkText: { color: c.success, fontFamily: 'Inter_700Bold', fontSize: 15 },
    });
}
