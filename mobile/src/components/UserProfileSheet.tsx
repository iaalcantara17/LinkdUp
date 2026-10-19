import React, { useEffect, useMemo, useState } from 'react';
import {
    View, Text, StyleSheet, Modal, TouchableOpacity,
    ActivityIndicator, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { X, GraduationCap, UserPlus, UserCheck, MoreHorizontal } from './icons';
import AvatarBubble from './AvatarBubble';
import { api } from '../services/api';
import DialogHost from './DialogHost';
import ReportDialog from './ReportDialog';
import { confirm, confirmBlock, errorText, showError, showMenu } from './dialogs';
import { radii } from '../theme';
import type { AppColors, ColorRoles } from '../theme';
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
    i_follow?: boolean;
    follows_me?: boolean;
}

interface Props {
    userId: string | null;
    visible: boolean;
    onClose: () => void;
}

export default function UserProfileSheet({ userId, visible, onClose }: Props) {
    const { colors, roles } = useTheme();
    const styles = useMemo(() => makeStyles(colors, roles), [colors, roles]);
    const nav = useNavigation<any>();

    const [profile, setProfile] = useState<PublicUser | null>(null);
    const [loading, setLoading] = useState(false);
    const [blockedByThem, setBlockedByThem] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selfState, setSelfState] = useState<'unknown' | 'self' | 'other'>('unknown');
    const [followBusy, setFollowBusy] = useState(false);
    const [myId, setMyId] = useState<string | null>(null);
    const [blockBusy, setBlockBusy] = useState(false);
    const [reporting, setReporting] = useState(false);

    useEffect(() => {
        if (!visible || !userId) return;
        let cancelled = false;
        setProfile(null);
        setError(null);
        setBlockedByThem(false);
        setLoading(true);
        setSelfState('unknown');
        setMyId(null);
        setReporting(false);

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
                if (cancelled) return;
                setMyId(me?.id ?? null);
                setSelfState(me?.id === userId ? 'self' : 'other');
            })
            .catch(() => { if (!cancelled) setSelfState('other'); });

        return () => { cancelled = true; };
    }, [userId, visible]);

    const isSelf = selfState === 'self';

    const setFollowing = (on: boolean) =>
        setProfile((p) => p && { ...p, i_follow: on, follower_count: Math.max(0, (p.follower_count ?? 0) + (on ? 1 : -1)) });

    const handleFollow = async () => {
        if (!userId) return;
        setFollowBusy(true);
        try {
            await api.followUser(userId);
            setFollowing(true);
        } catch (e: any) {
            showError("Couldn't follow", errorText(e, 'Try again in a moment.'));
        } finally {
            setFollowBusy(false);
        }
    };

    const handleUnfollow = async () => {
        if (!userId || !profile) return;
        const ok = await confirm({
            title: `Unfollow ${profile.display_name}?`,
            message: profile.follows_me ? "You won't be friends anymore." : 'You can follow them again anytime.',
            confirmLabel: 'Unfollow',
            destructive: true,
        });
        if (!ok) return;
        setFollowBusy(true);
        try {
            await api.unfollowUser(userId);
            setFollowing(false);
        } catch (e: any) {
            showError("Couldn't unfollow", errorText(e, 'Try again in a moment.'));
        } finally {
            setFollowBusy(false);
        }
    };

    const handleBlock = async () => {
        if (!userId || !profile) return;
        const ok = await confirmBlock(profile);
        if (!ok) return;
        setBlockBusy(true);
        try {
            await api.blockUser(userId);
            onClose();
        } catch (e: any) {
            showError("Couldn't block this person", errorText(e, 'Try again in a moment.'));
        } finally {
            setBlockBusy(false);
        }
    };

    const handleKebab = () => {
        if (!profile) return;
        showMenu(profile.display_name ?? 'Profile options', [
            { label: 'Block', destructive: true, onPress: handleBlock },
            { label: 'Report', onPress: () => setReporting(true) },
        ]);
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
                    <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel="Close">
                        <X size={18} color={roles.text} />
                    </TouchableOpacity>

                    {profile && !isSelf && !blockedByThem && (
                        <TouchableOpacity
                            style={styles.kebabBtn}
                            onPress={handleKebab}
                            activeOpacity={0.8}
                            disabled={blockBusy}
                            accessibilityRole="button"
                            accessibilityLabel={`More options for ${profile.display_name ?? 'this person'}`}
                        >
                            {blockBusy
                                ? <ActivityIndicator size="small" color={roles.text} />
                                : <MoreHorizontal size={18} color={roles.text} />
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

                                {selfState === 'other' && (
                                    <View style={{ marginTop: 20, alignSelf: 'stretch' }}>
                                        {!profile.i_follow ? (
                                            <TouchableOpacity
                                                style={styles.friendBtn}
                                                disabled={followBusy}
                                                onPress={handleFollow}
                                                accessibilityRole="button"
                                                accessibilityLabel={profile.follows_me ? 'Follow back' : 'Follow'}
                                            >
                                                <UserPlus size={18} color={roles.onPrimary} />
                                                <Text style={styles.friendBtnText}>{profile.follows_me ? 'Follow back' : 'Follow'}</Text>
                                            </TouchableOpacity>
                                        ) : profile.follows_me ? (
                                            <TouchableOpacity
                                                style={styles.friendOk}
                                                disabled={followBusy}
                                                onPress={handleUnfollow}
                                                accessibilityRole="button"
                                                accessibilityLabel="Friends"
                                            >
                                                <UserCheck size={16} color={colors.success} />
                                                <Text style={styles.friendOkText}>Friends</Text>
                                            </TouchableOpacity>
                                        ) : (
                                            <TouchableOpacity
                                                style={styles.friendPending}
                                                disabled={followBusy}
                                                onPress={handleUnfollow}
                                                accessibilityRole="button"
                                                accessibilityLabel="Following"
                                            >
                                                <UserCheck size={16} color={colors.text60} />
                                                <Text style={styles.friendPendingText}>Following</Text>
                                            </TouchableOpacity>
                                        )}
                                    </View>
                                )}
                            </>
                        ) : null}
                    </ScrollView>
                </SafeAreaView>
            </View>
            {reporting && profile && userId ? (
                <ReportDialog userId={userId} name={profile.username ? `@${profile.username}` : profile.display_name} onClose={() => setReporting(false)} />
            ) : null}
            <DialogHost />
        </Modal>
    );
}

function makeStyles(c: AppColors, r: ColorRoles) {
    return StyleSheet.create({
        overlay: {
            flex: 1,
            backgroundColor: r.scrim,
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
            top: 12,
            right: 64,
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: c.glassStrong,
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10,
        },
        kebabBtn: {
            position: 'absolute',
            top: 12,
            right: 12,
            width: 44,
            height: 44,
            borderRadius: 22,
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
            minHeight: 44,
        },
        friendBtnText: { color: r.onPrimary, fontFamily: 'Inter_700Bold', fontSize: 15 },
        friendPending: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            paddingVertical: 12,
            borderRadius: radii.md,
            borderWidth: 1,
            borderColor: c.glassBorder,
            minHeight: 44,
        },
        friendPendingText: { color: c.text60, fontFamily: 'Inter_600SemiBold', fontSize: 14 },
        friendOk: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            paddingVertical: 12,
            minHeight: 44,
        },
        friendOkText: { color: c.success, fontFamily: 'Inter_700Bold', fontSize: 15 },
    });
}
