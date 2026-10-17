import React, { useMemo, useState } from 'react';
import {
    View, Text, Image, TouchableOpacity, StyleSheet, Modal,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MapPin, Heart, MessageCircle, Share2, Bookmark, Plus, Check, MoreVertical, Trash2 } from './icons';
import { useTheme } from '../context/ThemeContext';
import { palette } from '../theme';
import type { AppColors, ColorRoles } from '../theme';
import DialogHost from './DialogHost';

export interface FeedPost {
    id: string;
    creator_id: string;
    creator_display_name: string;
    creator_username: string | null;
    creator_avatar_url: string | null;
    image_url: string;
    caption: string | null;
    venue_name: string;
    venue_address: string | null;
    venue_latitude: number | null;
    venue_longitude: number | null;
    venue_google_place_id: string | null;
    distance_miles: number | null;
    like_count: number;
    comment_count: number;
    liked_by_me: boolean;
    bookmarked_by_me: boolean;
    follows_creator: boolean;
    created_at: string;
}

interface Props {
    post: FeedPost;
    cardHeight: number;
    cardWidth: number;
    currentUserId: string | null;
    onLike: (post: FeedPost) => void;
    onComment: (post: FeedPost) => void;
    onShare: (post: FeedPost) => void;
    onBookmark: (post: FeedPost) => void;
    onFollow: (post: FeedPost) => void;
    onAddToParty: (post: FeedPost) => void;
    onDelete: (post: FeedPost) => void;
    onCreatorPress: (post: FeedPost) => void;
}

function formatCount(n: number): string {
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return String(n);
}

function CaptionText({ text }: { text: string }) {
    const { colors, roles: r } = useTheme();
    const cardStyles = useMemo(() => makeCardStyles(colors, r), [colors, r]);
    const tokens = text.split(/(\s+)/);
    return (
        <Text style={cardStyles.caption}>
            {tokens.map((token, i) =>
                token.startsWith('#')
                    ? <Text key={i} style={cardStyles.hashtag}>{token}</Text>
                    : token
            )}
        </Text>
    );
}

export default function FeedCard({
    post, cardHeight, cardWidth, currentUserId,
    onLike, onComment, onShare, onBookmark, onFollow, onAddToParty, onDelete, onCreatorPress,
}: Props) {
    const { colors, roles: r } = useTheme();
    const cardStyles = useMemo(() => makeCardStyles(colors, r), [colors, r]);
    const [menuVisible, setMenuVisible] = useState(false);

    const username = post.creator_username
        ?? post.creator_display_name.toLowerCase().replace(/\s+/g, '');

    const isSelf = currentUserId != null && post.creator_id === currentUserId;

    return (
        <View style={{ width: cardWidth, height: cardHeight, backgroundColor: palette.black }}>
            <Image
                source={{ uri: post.image_url }}
                style={StyleSheet.absoluteFill}
                resizeMode="cover"
                accessibilityLabel={post.caption ?? `Photo at ${post.venue_name}`}
                accessibilityRole="image"
            />

            <LinearGradient
                colors={['transparent', r.scrimStrong]}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={cardStyles.bottomGradient}
            />

            <View style={cardStyles.rail}>
                <TouchableOpacity
                    style={cardStyles.avatarContainer}
                    onPress={() => onCreatorPress(post)}
                    activeOpacity={0.9}
                >
                    {post.creator_avatar_url ? (
                        <Image
                            source={{ uri: post.creator_avatar_url }}
                            style={cardStyles.avatar}
                            accessibilityLabel={`${post.creator_display_name}'s avatar`}
                            accessibilityRole="image"
                        />
                    ) : (
                        <LinearGradient
                            colors={colors.gradient as any}
                            style={cardStyles.avatar}
                        />
                    )}
                    {!isSelf && (
                        <TouchableOpacity
                            style={cardStyles.plusCircle}
                            onPress={() => onFollow(post)}
                            activeOpacity={0.8}
                        >
                            {post.follows_creator ? (
                                <View style={[cardStyles.plusCircleInner, cardStyles.followingBg]}>
                                    <Check size={10} color={r.onMedia} strokeWidth={3} />
                                </View>
                            ) : (
                                <LinearGradient
                                    colors={colors.gradient as any}
                                    style={cardStyles.plusCircleInner}
                                >
                                    <Plus size={10} color={r.onPrimary} strokeWidth={3} />
                                </LinearGradient>
                            )}
                        </TouchableOpacity>
                    )}
                </TouchableOpacity>

                <View style={cardStyles.actionItem}>
                    <TouchableOpacity
                        style={cardStyles.actionCircle}
                        onPress={() => onLike(post)}
                        activeOpacity={0.8}
                    >
                        <Heart
                            size={24}
                            color={post.liked_by_me ? palette.red500 : r.onMedia}
                            fill={post.liked_by_me ? palette.red500 : 'transparent'}
                        />
                    </TouchableOpacity>
                    <Text style={cardStyles.actionLabel}>{formatCount(post.like_count)}</Text>
                </View>

                <View style={cardStyles.actionItem}>
                    <TouchableOpacity
                        style={cardStyles.actionCircle}
                        onPress={() => onComment(post)}
                        activeOpacity={0.8}
                    >
                        <MessageCircle size={24} color={r.onMedia} />
                    </TouchableOpacity>
                    <Text style={cardStyles.actionLabel}>{formatCount(post.comment_count)}</Text>
                </View>

                <View style={cardStyles.actionItem}>
                    <TouchableOpacity
                        style={cardStyles.actionCircle}
                        onPress={() => onShare(post)}
                        activeOpacity={0.8}
                    >
                        <Share2 size={24} color={r.onMedia} />
                    </TouchableOpacity>
                    <Text style={cardStyles.actionLabel}>Share</Text>
                </View>

                <TouchableOpacity
                    style={cardStyles.actionCircle}
                    onPress={() => onBookmark(post)}
                    activeOpacity={0.8}
                >
                    <Bookmark
                        size={24}
                        color={post.bookmarked_by_me ? palette.yellow400 : r.onMedia}
                        fill={post.bookmarked_by_me ? palette.yellow400 : 'transparent'}
                    />
                </TouchableOpacity>
            </View>

            <View style={cardStyles.info}>
                <View style={cardStyles.usernameRow}>
                    <Text style={cardStyles.username}>@{username}</Text>
                    {!isSelf && (
                        <TouchableOpacity
                            style={[
                                cardStyles.followPill,
                                post.follows_creator && cardStyles.followingPill,
                            ]}
                            onPress={() => onFollow(post)}
                            activeOpacity={0.8}
                        >
                            <Text style={cardStyles.followPillText}>
                                {post.follows_creator ? 'Following' : 'Follow'}
                            </Text>
                        </TouchableOpacity>
                    )}
                </View>

                <View style={cardStyles.venueRow}>
                    <MapPin size={14} color={palette.violet300} />
                    <Text style={cardStyles.venueName} numberOfLines={1}>
                        {post.venue_name}
                    </Text>
                    {post.distance_miles != null && (
                        <Text style={cardStyles.venueDistance}>
                            {' '}• {post.distance_miles} mi away
                        </Text>
                    )}
                </View>

                {post.caption ? <CaptionText text={post.caption} /> : null}

                <TouchableOpacity
                    onPress={() => onAddToParty(post)}
                    activeOpacity={0.85}
                    style={{ alignSelf: 'flex-start' }}
                >
                    <LinearGradient
                        colors={colors.gradient as any}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={cardStyles.addBtn}
                    >
                        <Text style={cardStyles.addBtnText}>Add to Party Swipes</Text>
                    </LinearGradient>
                </TouchableOpacity>
            </View>

            {isSelf && (
                <TouchableOpacity
                    style={cardStyles.menuBtn}
                    onPress={() => setMenuVisible(true)}
                    activeOpacity={0.8}
                    hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                >
                    <MoreVertical size={20} color={r.onMedia} />
                </TouchableOpacity>
            )}

            <Modal
                visible={menuVisible}
                transparent
                animationType="fade"
                onRequestClose={() => setMenuVisible(false)}
            >
                <TouchableOpacity
                    style={cardStyles.menuBackdrop}
                    activeOpacity={1}
                    onPress={() => setMenuVisible(false)}
                />
                <View style={[cardStyles.menuSheet, { backgroundColor: colors.surface }]}>
                    <TouchableOpacity
                        style={cardStyles.menuRow}
                        onPress={() => {
                            setMenuVisible(false);
                            onDelete(post);
                        }}
                        activeOpacity={0.8}
                    >
                        <Trash2 size={18} color={r.danger} />
                        <Text style={[cardStyles.menuRowText, { color: r.danger }]}>Delete post</Text>
                    </TouchableOpacity>
                </View>
                <DialogHost />
            </Modal>
        </View>
    );
}

function makeCardStyles(colors: AppColors, r: ColorRoles) {
    return StyleSheet.create({
        bottomGradient: {
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: '80%',
        },
        rail: {
            position: 'absolute',
            right: 16,
            bottom: 128,
            zIndex: 20,
            alignItems: 'center',
            gap: 24,
        },
        avatarContainer: {
            alignItems: 'center',
        },
        avatar: {
            width: 48,
            height: 48,
            borderRadius: 24,
            borderWidth: 2,
            borderColor: r.onMedia,
        },
        plusCircle: {
            marginTop: -8,
        },
        plusCircleInner: {
            width: 20,
            height: 20,
            borderRadius: 10,
            alignItems: 'center',
            justifyContent: 'center',
        },
        followingBg: {
            backgroundColor: r.mediaFill,
        },
        actionItem: {
            alignItems: 'center',
            gap: 4,
        },
        actionCircle: {
            width: 48,
            height: 48,
            borderRadius: 24,
            backgroundColor: r.scrim,
            alignItems: 'center',
            justifyContent: 'center',
        },
        actionLabel: {
            color: r.onMedia,
            fontFamily: 'Inter_500Medium',
            fontSize: 12,
            textShadowColor: r.scrim,
            textShadowOffset: { width: 0, height: 1 },
            textShadowRadius: 2,
        },
        info: {
            position: 'absolute',
            bottom: 128,
            left: 24,
            right: 80,
            zIndex: 20,
            gap: 8,
        },
        usernameRow: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
        },
        username: {
            color: r.onMedia,
            fontFamily: 'Inter_700Bold',
            fontSize: 15,
            textShadowColor: r.scrim,
            textShadowOffset: { width: 0, height: 1 },
            textShadowRadius: 3,
        },
        followPill: {
            paddingHorizontal: 12,
            paddingVertical: 4,
            borderRadius: 20,
            backgroundColor: r.mediaFill,
            borderWidth: 1,
            borderColor: r.onMediaFaint,
        },
        followingPill: {
            backgroundColor: 'transparent',
            borderColor: r.onMediaFaint,
        },
        followPillText: {
            color: r.onMedia,
            fontFamily: 'Inter_700Bold',
            fontSize: 11,
        },
        venueRow: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 5,
        },
        venueName: {
            color: r.onMedia,
            fontFamily: 'Inter_700Bold',
            fontSize: 13,
            flexShrink: 1,
        },
        venueDistance: {
            color: r.onMediaMuted,
            fontFamily: 'Inter_400Regular',
            fontSize: 13,
            flexShrink: 0,
        },
        caption: {
            color: r.onMedia,
            fontFamily: 'Inter_400Regular',
            fontSize: 14,
            lineHeight: 20,
        },
        hashtag: {
            color: palette.violet300,
            fontFamily: 'Inter_600SemiBold',
        },
        addBtn: {
            paddingHorizontal: 24,
            paddingVertical: 10,
            borderRadius: 20,
            alignItems: 'center',
        },
        addBtnText: {
            color: r.onPrimary,
            fontFamily: 'Inter_700Bold',
            fontSize: 13,
        },
        menuBtn: {
            position: 'absolute',
            top: 60,
            right: 16,
            zIndex: 30,
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: r.scrim,
            alignItems: 'center',
            justifyContent: 'center',
        },
        menuBackdrop: {
            flex: 1,
            backgroundColor: r.scrim,
        },
        menuSheet: {
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            paddingBottom: 36,
        },
        menuRow: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            paddingHorizontal: 24,
            paddingVertical: 18,
        },
        menuRowText: {
            fontFamily: 'Inter_600SemiBold',
            fontSize: 15,
        },
    });
}
