import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
    View, Text, FlatList, TouchableOpacity, ActivityIndicator,
    StyleSheet, useWindowDimensions, Share, Alert, Modal, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, Plus, X } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { api } from '../services/api';
import { radii } from '../theme';
import type { AppColors } from '../theme';
import { useTheme } from '../context/ThemeContext';
import FeedCard, { FeedPost } from './FeedCard';
import CommentSheet from './CommentSheet';
import BookmarkSheet from './BookmarkSheet';

interface Props {
    onBack: () => void;
}

export default function FeedView({ onBack }: Props) {
    const { height, width } = useWindowDimensions();
    const nav = useNavigation<any>();
    const { colors } = useTheme();
    const sheetStyles = useMemo(() => makeSheetStyles(colors), [colors]);

    const [posts, setPosts] = useState<FeedPost[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [toast, setToast] = useState<string | null>(null);

    const [commentPostId, setCommentPostId] = useState<string | null>(null);
    const [partyChooserPostId, setPartyChooserPostId] = useState<string | null>(null);
    const [parties, setParties] = useState<any[]>([]);
    const [bookmarkSheetPostId, setBookmarkSheetPostId] = useState<string | null>(null);

    const showToast = useCallback((msg: string) => {
        setToast(msg);
        setTimeout(() => setToast(null), 2500);
    }, []);

    const loadFeed = useCallback(async () => {
        try {
            const [result, me] = await Promise.all([
                api.getFeed({ limit: 20 }),
                api.me().catch(() => null),
            ]);
            setPosts(result.posts as FeedPost[]);
            setCurrentUserId(me?.id ?? null);
        } catch (e) {
            console.error('[feed] load error', e);
        } finally {
            setLoading(false);
        }
    }, []);

    useFocusEffect(useCallback(() => {
        setLoading(true);
        loadFeed();
    }, [loadFeed]));

    const updatePost = useCallback((id: string, patch: Partial<FeedPost>) => {
        setPosts((prev) => prev.map((p) => p.id === id ? { ...p, ...patch } : p));
    }, []);

    const handleLike = useCallback(async (post: FeedPost) => {
        const wasLiked = post.liked_by_me;
        const newLiked = !wasLiked;
        updatePost(post.id, {
            liked_by_me: newLiked,
            like_count: post.like_count + (newLiked ? 1 : -1),
        });
        try {
            if (newLiked) {
                await api.likeFeedPost(post.id);
            } else {
                await api.unlikeFeedPost(post.id);
            }
        } catch (e: any) {
            updatePost(post.id, { liked_by_me: wasLiked, like_count: post.like_count });
            showToast('Could not update like');
        }
    }, [updatePost, showToast]);

    const handleBookmark = useCallback(async (post: FeedPost) => {
        if (!post.bookmarked_by_me) {
            setBookmarkSheetPostId(post.id);
            return;
        }
        updatePost(post.id, { bookmarked_by_me: false });
        try {
            await api.unbookmarkFeedPost(post.id);
            showToast('Removed from saved');
        } catch (e: any) {
            updatePost(post.id, { bookmarked_by_me: true });
            showToast('Could not remove bookmark');
        }
    }, [updatePost, showToast]);

    const handleBookmarkSaved = useCallback((postId: string) => {
        updatePost(postId, { bookmarked_by_me: true });
        setBookmarkSheetPostId(null);
        showToast('Saved');
    }, [updatePost, showToast]);

    const handleDelete = useCallback(async (post: FeedPost) => {
        const doDelete = async () => {
            try {
                await api.deleteFeedPost(post.id);
                setPosts((prev) => prev.filter((p) => p.id !== post.id));
                showToast('Post deleted');
            } catch (e: any) {
                showToast(e?.message ?? 'Could not delete post');
            }
        };

        if (Platform.OS === 'web') {
            if ((window as any).confirm('Delete this post?\n\nThis will permanently remove your post.')) {
                await doDelete();
            }
        } else {
            Alert.alert(
                'Delete Post',
                'This will permanently remove your post. Continue?',
                [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Delete', style: 'destructive', onPress: doDelete },
                ]
            );
        }
    }, [showToast]);

    const handleFollow = useCallback(async (post: FeedPost) => {
        if (currentUserId && post.creator_id === currentUserId) return;
        const wasFollowing = post.follows_creator;
        const nowFollowing = !wasFollowing;
        updatePost(post.id, { follows_creator: nowFollowing });
        try {
            if (nowFollowing) {
                await api.followUser(post.creator_id);
                showToast(`Following @${post.creator_username ?? post.creator_display_name}`);
            } else {
                await api.unfollowUser(post.creator_id);
            }
        } catch (e: any) {
            updatePost(post.id, { follows_creator: wasFollowing });
            showToast(e?.message ?? 'Could not update follow');
        }
    }, [currentUserId, updatePost, showToast]);

    const handleComment = useCallback((post: FeedPost) => {
        setCommentPostId(post.id);
    }, []);

    const handleCommentCountChange = useCallback((postId: string, delta: number) => {
        setPosts((prev) =>
            prev.map((p) => p.id === postId
                ? { ...p, comment_count: Math.max(0, p.comment_count + delta) }
                : p
            )
        );
    }, []);

    const handleShare = useCallback(async (post: FeedPost) => {
        const link = `https://linkdup.app/post/${post.id}`;
        if (Platform.OS === 'web') {
            try {
                await (navigator as any).clipboard.writeText(link);
                showToast('Link copied!');
            } catch {
                showToast('Link: ' + link);
            }
            return;
        }
        try {
            await Share.share({ message: `Check out ${post.venue_name} on LinkdUp! ${link}` });
        } catch {
            // user dismissed
        }
    }, [showToast]);

    const handleAddToParty = useCallback(async (post: FeedPost) => {
        try {
            const myParties = await api.myParties();
            const eligible = myParties.filter((p: any) =>
                p.status === 'swiping' || p.status === 'waiting'
            );
            if (eligible.length === 0) {
                showToast('No active parties — create one first');
                return;
            }
            setParties(eligible);
            setPartyChooserPostId(post.id);
        } catch (e: any) {
            showToast(e?.message ?? 'Could not load parties');
        }
    }, [showToast]);

    const confirmAddToParty = useCallback(async (partyId: string, partyName: string) => {
        if (!partyChooserPostId) return;
        setPartyChooserPostId(null);
        try {
            await api.addPostVenueToParty(partyChooserPostId, partyId);
            showToast(`Added to ${partyName}!`);
        } catch (e: any) {
            showToast(e?.message ?? 'Could not add venue');
        }
    }, [partyChooserPostId, showToast]);

    const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 });
    const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
        if (viewableItems.length > 0) setCurrentIndex(viewableItems[0].index ?? 0);
    });

    const commentPost = commentPostId ? posts.find((p) => p.id === commentPostId) : null;

    if (loading) {
        return (
            <View style={feedStyles.loadingRoot}>
                <ActivityIndicator color="white" size="large" />
            </View>
        );
    }

    if (posts.length === 0) {
        return (
            <View style={[feedStyles.loadingRoot, { padding: 40 }]}>
                <Text style={feedStyles.emptyTitle}>No posts yet</Text>
                <Text style={feedStyles.emptySubtitle}>
                    Be the first — tap + above to post
                </Text>
                <TouchableOpacity onPress={onBack} style={{ marginTop: 20 }}>
                    <Text style={[feedStyles.backLink, { color: colors.primary }]}>Back to Explore</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <View style={feedStyles.root}>
            {toast && (
                <View style={feedStyles.toast} pointerEvents="none">
                    <Text style={feedStyles.toastText}>{toast}</Text>
                </View>
            )}

            <FlatList
                data={posts}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                    <FeedCard
                        post={item}
                        cardHeight={height}
                        cardWidth={width}
                        currentUserId={currentUserId}
                        onLike={handleLike}
                        onComment={handleComment}
                        onShare={handleShare}
                        onBookmark={handleBookmark}
                        onFollow={handleFollow}
                        onAddToParty={handleAddToParty}
                        onDelete={handleDelete}
                        onCreatorPress={(p) => console.log('[feed] creatorPress', p.id)}
                    />
                )}
                pagingEnabled
                snapToInterval={height}
                snapToAlignment="start"
                decelerationRate="fast"
                showsVerticalScrollIndicator={false}
                getItemLayout={(_, index) => ({
                    length: height,
                    offset: height * index,
                    index,
                })}
                onViewableItemsChanged={onViewableItemsChanged.current}
                viewabilityConfig={viewabilityConfig.current}
            />

            <SafeAreaView
                style={feedStyles.topBarOuter}
                edges={['top']}
                pointerEvents="box-none"
            >
                <View style={feedStyles.topBarRow} pointerEvents="box-none">
                    <TouchableOpacity
                        style={feedStyles.backBtn}
                        onPress={onBack}
                        activeOpacity={0.8}
                    >
                        <ChevronLeft size={20} color="white" />
                    </TouchableOpacity>
                    <Text style={feedStyles.topTitle}>Discover</Text>
                    <TouchableOpacity
                        style={feedStyles.createBtn}
                        onPress={() => nav.navigate('CreatePost')}
                        activeOpacity={0.85}
                    >
                        <LinearGradient
                            colors={colors.gradient as any}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={feedStyles.createBtnInner}
                        >
                            <Plus size={20} color="white" strokeWidth={2.5} />
                        </LinearGradient>
                    </TouchableOpacity>
                </View>
                <View style={feedStyles.dotsRow} pointerEvents="none">
                    {posts.map((_, i) => (
                        <View
                            key={i}
                            style={[
                                feedStyles.dot,
                                i === currentIndex
                                    ? feedStyles.dotCurrent
                                    : i < currentIndex
                                        ? feedStyles.dotPast
                                        : feedStyles.dotFuture,
                            ]}
                        />
                    ))}
                </View>
            </SafeAreaView>

            {commentPost && (
                <CommentSheet
                    postId={commentPost.id}
                    visible={!!commentPostId}
                    onClose={() => setCommentPostId(null)}
                    currentUserId={currentUserId}
                    initialCommentCount={commentPost.comment_count}
                    onCommentCountChange={(delta) => handleCommentCountChange(commentPost.id, delta)}
                />
            )}

            <Modal
                visible={!!partyChooserPostId}
                transparent
                animationType="slide"
                onRequestClose={() => setPartyChooserPostId(null)}
            >
                <TouchableOpacity
                    style={feedStyles.modalBackdrop}
                    activeOpacity={1}
                    onPress={() => setPartyChooserPostId(null)}
                />
                <SafeAreaView style={sheetStyles.partySheet} edges={['bottom']}>
                    <View style={sheetStyles.partySheetHeader}>
                        <Text style={sheetStyles.partySheetTitle}>Add to a Party</Text>
                        <TouchableOpacity onPress={() => setPartyChooserPostId(null)} hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}>
                            <X size={20} color={colors.text60} />
                        </TouchableOpacity>
                    </View>
                    {parties.map((p: any) => (
                        <TouchableOpacity
                            key={p.id}
                            style={sheetStyles.partyRow}
                            onPress={() => confirmAddToParty(p.id, p.name ?? 'Party')}
                            activeOpacity={0.8}
                        >
                            <Text style={sheetStyles.partyRowName}>{p.name ?? 'Unnamed Party'}</Text>
                            <Text style={sheetStyles.partyRowStatus}>{p.status}</Text>
                        </TouchableOpacity>
                    ))}
                </SafeAreaView>
            </Modal>

            <BookmarkSheet
                postId={bookmarkSheetPostId}
                visible={bookmarkSheetPostId !== null}
                onClose={() => setBookmarkSheetPostId(null)}
                onSaved={handleBookmarkSaved}
            />
        </View>
    );
}

const feedStyles = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: '#000',
    },
    loadingRoot: {
        flex: 1,
        backgroundColor: '#000',
        alignItems: 'center',
        justifyContent: 'center',
    },
    toast: {
        position: 'absolute',
        top: 90,
        alignSelf: 'center',
        backgroundColor: 'rgba(0,0,0,0.75)',
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 20,
        zIndex: 99,
    },
    toastText: {
        color: 'white',
        fontFamily: 'Inter_500Medium',
        fontSize: 13,
    },
    topBarOuter: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 20,
    },
    topBarRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    backBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(0,0,0,0.40)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    topTitle: {
        color: 'white',
        fontFamily: 'Inter_900Black',
        fontSize: 20,
    },
    dotsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 5,
        paddingBottom: 8,
    },
    dot: {
        height: 4,
        borderRadius: 2,
    },
    dotCurrent: {
        width: 24,
        backgroundColor: 'white',
    },
    dotPast: {
        width: 8,
        backgroundColor: 'rgba(255,255,255,0.50)',
    },
    dotFuture: {
        width: 8,
        backgroundColor: 'rgba(255,255,255,0.20)',
    },
    emptyTitle: {
        color: 'white',
        fontFamily: 'Inter_700Bold',
        fontSize: 18,
        textAlign: 'center',
    },
    emptySubtitle: {
        color: 'rgba(255,255,255,0.60)',
        fontFamily: 'Inter_400Regular',
        fontSize: 14,
        textAlign: 'center',
        marginTop: 8,
    },
    backLink: {
        fontFamily: 'Inter_600SemiBold',
        fontSize: 15,
    },
    createBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
    },
    createBtnInner: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    modalBackdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
});

function makeSheetStyles(c: AppColors) {
    return StyleSheet.create({
        partySheet: {
            backgroundColor: c.surface,
            borderTopLeftRadius: radii.xl,
            borderTopRightRadius: radii.xl,
            paddingBottom: 8,
            maxHeight: '50%',
        },
        partySheetHeader: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 20,
            paddingVertical: 16,
            borderBottomWidth: 1,
            borderBottomColor: c.glassBorder,
        },
        partySheetTitle: {
            color: c.textPrimary,
            fontFamily: 'Inter_700Bold',
            fontSize: 16,
        },
        partyRow: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 20,
            paddingVertical: 16,
            borderBottomWidth: 1,
            borderBottomColor: c.glassBorder,
        },
        partyRowName: {
            color: c.textPrimary,
            fontFamily: 'Inter_600SemiBold',
            fontSize: 15,
        },
        partyRowStatus: {
            color: c.text40,
            fontFamily: 'Inter_400Regular',
            fontSize: 13,
            textTransform: 'capitalize',
        },
    });
}
