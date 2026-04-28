import React, { useCallback, useMemo, useState } from 'react';
import {
    View, Text, Image, TouchableOpacity, FlatList,
    StyleSheet, useWindowDimensions, ActivityIndicator,
    Modal, TextInput, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, Heart, MessageCircle, MoreVertical, Pencil, Trash2, Plus } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { api } from '../services/api';
import { radii } from '../theme';
import type { AppColors } from '../theme';
import { useTheme } from '../context/ThemeContext';
import BottomNav from '../components/BottomNav';

interface PostItem {
    id: string;
    image_url: string;
    caption: string | null;
    venue_name: string;
    like_count: number;
    comment_count: number;
    created_at: string;
}

const TILE_GAP = 10;
const TILE_PADDING = 16;

export default function MyPostsScreen() {
    const nav = useNavigation<any>();
    const { colors } = useTheme();
    const styles = useMemo(() => makeStyles(colors), [colors]);
    const { width } = useWindowDimensions();

    const [posts, setPosts] = useState<PostItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [toast, setToast] = useState<string | null>(null);

    const [menuPost, setMenuPost] = useState<PostItem | null>(null);
    const [editPost, setEditPost] = useState<PostItem | null>(null);
    const [editCaption, setEditCaption] = useState('');
    const [editSaving, setEditSaving] = useState(false);

    const showToast = useCallback((msg: string) => {
        setToast(msg);
        setTimeout(() => setToast(null), 2500);
    }, []);

    const tileSize = (width - TILE_PADDING * 2 - TILE_GAP) / 2;

    useFocusEffect(useCallback(() => {
        setLoading(true);
        api.getMyPosts()
            .then((res) => setPosts(res.posts ?? []))
            .catch(() => setPosts([]))
            .finally(() => setLoading(false));
    }, []));

    const openMenu = useCallback((post: PostItem) => {
        setMenuPost(post);
    }, []);

    const openEdit = useCallback((post: PostItem) => {
        setMenuPost(null);
        setEditCaption(post.caption ?? '');
        setEditPost(post);
    }, []);

    const handleSaveCaption = useCallback(async () => {
        if (!editPost || editSaving) return;
        setEditSaving(true);
        try {
            const newCaption = editCaption.trim() || null;
            await api.editFeedPost(editPost.id, newCaption);
            setPosts((prev) =>
                prev.map((p) => p.id === editPost.id ? { ...p, caption: newCaption } : p)
            );
            setEditPost(null);
        } catch {
            Alert.alert('Error', 'Could not save changes');
        } finally {
            setEditSaving(false);
        }
    }, [editPost, editCaption, editSaving]);

    const handleDelete = useCallback((post: PostItem) => {
        setMenuPost(null);

        const doDelete = async () => {
            try {
                await api.deleteFeedPost(post.id);
                setPosts((prev) => prev.filter((p) => p.id !== post.id));
            } catch {
                showToast('Could not delete post');
            }
        };

        if (Platform.OS === 'web') {
            if ((window as any).confirm('Delete this post?\n\nThis will permanently remove your post and all its likes and comments.')) {
                doDelete();
            }
        } else {
            Alert.alert(
                'Delete Post',
                'This will permanently remove your post and all its likes and comments.',
                [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Delete', style: 'destructive', onPress: doDelete },
                ]
            );
        }
    }, [showToast]);

    const renderItem = useCallback(({ item }: { item: PostItem }) => (
        <View style={[styles.card, { width: tileSize }]}>
            <Image
                source={{ uri: item.image_url }}
                style={[styles.cardImage, { height: tileSize * 1.2 }]}
                resizeMode="cover"
            />

            <TouchableOpacity
                style={styles.menuBtn}
                onPress={() => openMenu(item)}
                hitSlop={{ top: 6, right: 6, bottom: 6, left: 6 }}
                activeOpacity={0.8}
            >
                <MoreVertical size={18} color="white" />
            </TouchableOpacity>

            <View style={styles.cardMeta}>
                <Text style={styles.venueName} numberOfLines={1}>{item.venue_name}</Text>
                <View style={styles.counts}>
                    <Heart size={11} color="white" fill="white" />
                    <Text style={styles.countText}>{item.like_count}</Text>
                    <MessageCircle size={11} color="white" />
                    <Text style={styles.countText}>{item.comment_count}</Text>
                </View>
                {item.caption ? (
                    <Text style={styles.caption} numberOfLines={2}>{item.caption}</Text>
                ) : null}
            </View>
        </View>
    ), [styles, tileSize, openMenu]);

    return (
        <View style={[styles.root, { backgroundColor: colors.bg }]}>
            {toast !== null && (
                <View style={styles.toast} pointerEvents="none">
                    <Text style={styles.toastText}>{toast}</Text>
                </View>
            )}
            <SafeAreaView edges={['top']}>
                <View style={styles.header}>
                    <TouchableOpacity
                        style={styles.backBtn}
                        onPress={() => nav.goBack()}
                        activeOpacity={0.8}
                    >
                        <ChevronLeft size={22} color={colors.textPrimary} />
                    </TouchableOpacity>
                    <Text style={[styles.title, { color: colors.textPrimary }]}>My Posts</Text>
                    <TouchableOpacity
                        style={styles.addBtn}
                        onPress={() => nav.navigate('CreatePost')}
                        activeOpacity={0.85}
                    >
                        <LinearGradient
                            colors={colors.gradient as any}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.addBtnInner}
                        >
                            <Plus size={20} color="white" strokeWidth={2.5} />
                        </LinearGradient>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>

            {loading ? (
                <View style={styles.center}>
                    <ActivityIndicator color={colors.primary} size="large" />
                </View>
            ) : posts.length === 0 ? (
                <View style={styles.center}>
                    <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>Your feed starts here</Text>
                    <Text style={[styles.emptySub, { color: colors.text60 }]}>
                        Every great story starts with one post. Share a spot you love and let your crew discover it.
                    </Text>
                    <TouchableOpacity
                        style={{ marginTop: 24 }}
                        onPress={() => nav.navigate('CreatePost')}
                        activeOpacity={0.85}
                    >
                        <LinearGradient
                            colors={colors.gradient as any}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={styles.emptyBtn}
                        >
                            <Plus size={16} color="white" strokeWidth={2.5} style={{ marginRight: 6 }} />
                            <Text style={styles.emptyBtnText}>Create your first post</Text>
                        </LinearGradient>
                    </TouchableOpacity>
                </View>
            ) : (
                <FlatList
                    data={posts}
                    keyExtractor={(item) => item.id}
                    renderItem={renderItem}
                    numColumns={2}
                    columnWrapperStyle={styles.row}
                    contentContainerStyle={styles.listContent}
                    showsVerticalScrollIndicator={false}
                />
            )}

            <BottomNav />

            {/* Post action menu */}
            <Modal
                visible={menuPost !== null}
                transparent
                animationType="fade"
                onRequestClose={() => setMenuPost(null)}
            >
                <TouchableOpacity
                    style={styles.menuBackdrop}
                    activeOpacity={1}
                    onPress={() => setMenuPost(null)}
                />
                <SafeAreaView style={[styles.actionSheet, { backgroundColor: colors.surface }]} edges={['bottom']}>
                    <View style={styles.actionSheetHandle} />
                    <Text style={[styles.actionSheetTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                        {menuPost?.venue_name}
                    </Text>
                    <TouchableOpacity
                        style={styles.actionRow}
                        onPress={() => menuPost && openEdit(menuPost)}
                        activeOpacity={0.8}
                    >
                        <View style={[styles.actionIcon, { backgroundColor: `${colors.primary}18` }]}>
                            <Pencil size={18} color={colors.primary} />
                        </View>
                        <View>
                            <Text style={[styles.actionLabel, { color: colors.textPrimary }]}>Edit caption</Text>
                            <Text style={[styles.actionSub, { color: colors.text60 }]}>Update your post's caption</Text>
                        </View>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={styles.actionRow}
                        onPress={() => menuPost && handleDelete(menuPost)}
                        activeOpacity={0.8}
                    >
                        <View style={[styles.actionIcon, { backgroundColor: 'rgba(255,59,92,0.12)' }]}>
                            <Trash2 size={18} color="#FF3B5C" />
                        </View>
                        <View>
                            <Text style={[styles.actionLabel, { color: '#FF3B5C' }]}>Delete post</Text>
                            <Text style={[styles.actionSub, { color: colors.text60 }]}>Permanently remove this post</Text>
                        </View>
                    </TouchableOpacity>
                </SafeAreaView>
            </Modal>

            {/* Edit caption modal */}
            <Modal
                visible={editPost !== null}
                transparent
                animationType="slide"
                onRequestClose={() => setEditPost(null)}
            >
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={{ flex: 1 }}
                >
                    <TouchableOpacity
                        style={styles.menuBackdrop}
                        activeOpacity={1}
                        onPress={() => setEditPost(null)}
                    />
                    <SafeAreaView style={[styles.editSheet, { backgroundColor: colors.surface }]} edges={['bottom']}>
                        <View style={styles.editHeader}>
                            <Text style={[styles.editTitle, { color: colors.textPrimary }]}>Edit Caption</Text>
                            <TouchableOpacity
                                onPress={() => setEditPost(null)}
                                hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
                            >
                                <Text style={[styles.editCancel, { color: colors.text60 }]}>Cancel</Text>
                            </TouchableOpacity>
                        </View>
                        <TextInput
                            style={[styles.editInput, {
                                color: colors.textPrimary,
                                borderColor: colors.glassBorder,
                                backgroundColor: colors.glass,
                            }]}
                            value={editCaption}
                            onChangeText={setEditCaption}
                            placeholder="Write a caption..."
                            placeholderTextColor={colors.text40}
                            multiline
                            maxLength={500}
                            autoFocus
                        />
                        <Text style={[styles.charCount, { color: colors.text40 }]}>
                            {editCaption.length}/500
                        </Text>
                        <TouchableOpacity
                            onPress={handleSaveCaption}
                            disabled={editSaving}
                            activeOpacity={0.85}
                        >
                            <LinearGradient
                                colors={colors.gradient as any}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                                style={[styles.saveBtn, editSaving && { opacity: 0.5 }]}
                            >
                                <Text style={styles.saveBtnText}>{editSaving ? 'Saving...' : 'Save'}</Text>
                            </LinearGradient>
                        </TouchableOpacity>
                    </SafeAreaView>
                </KeyboardAvoidingView>
            </Modal>
        </View>
    );
}

function makeStyles(c: AppColors) {
    return StyleSheet.create({
        root: {
            flex: 1,
        },
        header: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: TILE_PADDING,
            paddingVertical: 12,
        },
        backBtn: {
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: c.glass,
            alignItems: 'center',
            justifyContent: 'center',
        },
        title: {
            fontFamily: 'Inter_700Bold',
            fontSize: 18,
        },
        addBtn: {
            width: 40,
            height: 40,
            borderRadius: 20,
        },
        addBtnInner: {
            width: 40,
            height: 40,
            borderRadius: 20,
            alignItems: 'center',
            justifyContent: 'center',
        },
        center: {
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            padding: 40,
        },
        emptyTitle: {
            fontFamily: 'Inter_700Bold',
            fontSize: 18,
            textAlign: 'center',
        },
        emptySub: {
            fontFamily: 'Inter_400Regular',
            fontSize: 14,
            textAlign: 'center',
            marginTop: 8,
            lineHeight: 20,
        },
        emptyBtn: {
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 28,
            paddingVertical: 13,
            borderRadius: radii.pill,
        },
        emptyBtnText: {
            color: 'white',
            fontFamily: 'Inter_700Bold',
            fontSize: 14,
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
        listContent: {
            paddingHorizontal: TILE_PADDING,
            paddingTop: 8,
            paddingBottom: 110,
            gap: TILE_GAP,
        },
        row: {
            gap: TILE_GAP,
        },
        card: {
            borderRadius: radii.lg,
            overflow: 'hidden',
            backgroundColor: c.glass,
        },
        cardImage: {
            width: '100%',
            borderTopLeftRadius: radii.lg,
            borderTopRightRadius: radii.lg,
        },
        menuBtn: {
            position: 'absolute',
            top: 8,
            right: 8,
            width: 30,
            height: 30,
            borderRadius: 15,
            backgroundColor: 'rgba(0,0,0,0.45)',
            alignItems: 'center',
            justifyContent: 'center',
        },
        cardMeta: {
            padding: 10,
            gap: 4,
        },
        venueName: {
            color: c.textPrimary,
            fontFamily: 'Inter_700Bold',
            fontSize: 12,
        },
        counts: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
        },
        countText: {
            color: c.text60,
            fontFamily: 'Inter_500Medium',
            fontSize: 11,
            marginRight: 4,
        },
        caption: {
            color: c.text60,
            fontFamily: 'Inter_400Regular',
            fontSize: 11,
            lineHeight: 15,
        },
        menuBackdrop: {
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.5)',
        },
        actionSheet: {
            borderTopLeftRadius: radii.xl,
            borderTopRightRadius: radii.xl,
            paddingTop: 8,
            paddingBottom: 8,
        },
        actionSheetHandle: {
            width: 36,
            height: 4,
            borderRadius: 2,
            backgroundColor: 'rgba(128,128,128,0.35)',
            alignSelf: 'center',
            marginBottom: 12,
        },
        actionSheetTitle: {
            fontFamily: 'Inter_600SemiBold',
            fontSize: 13,
            paddingHorizontal: 20,
            paddingBottom: 10,
            opacity: 0.6,
        },
        actionRow: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 14,
            paddingHorizontal: 20,
            paddingVertical: 14,
        },
        actionIcon: {
            width: 42,
            height: 42,
            borderRadius: 12,
            alignItems: 'center',
            justifyContent: 'center',
        },
        actionLabel: {
            fontFamily: 'Inter_600SemiBold',
            fontSize: 15,
        },
        actionSub: {
            fontFamily: 'Inter_400Regular',
            fontSize: 12,
            marginTop: 1,
        },
        editSheet: {
            borderTopLeftRadius: radii.xl,
            borderTopRightRadius: radii.xl,
            padding: 20,
        },
        editHeader: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 16,
        },
        editTitle: {
            fontFamily: 'Inter_700Bold',
            fontSize: 16,
        },
        editCancel: {
            fontFamily: 'Inter_500Medium',
            fontSize: 15,
        },
        editInput: {
            borderWidth: 1,
            borderRadius: radii.md,
            padding: 12,
            fontFamily: 'Inter_400Regular',
            fontSize: 14,
            minHeight: 90,
            textAlignVertical: 'top',
            lineHeight: 20,
        },
        charCount: {
            fontFamily: 'Inter_400Regular',
            fontSize: 11,
            textAlign: 'right',
            marginTop: 4,
            marginBottom: 16,
        },
        saveBtn: {
            paddingVertical: 14,
            borderRadius: radii.pill,
            alignItems: 'center',
        },
        saveBtnText: {
            color: 'white',
            fontFamily: 'Inter_700Bold',
            fontSize: 15,
        },
    });
}
