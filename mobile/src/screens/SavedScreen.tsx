import React, { useCallback, useMemo, useState } from 'react';
import {
    View, Text, Image, TouchableOpacity, FlatList,
    StyleSheet, useWindowDimensions, ActivityIndicator,
    ScrollView, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, Trash2 } from 'lucide-react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { api } from '../services/api';
import { radii } from '../theme';
import type { AppColors } from '../theme';
import { useTheme } from '../context/ThemeContext';
import BottomNav from '../components/BottomNav';

interface SavedPost {
    id: string;
    image_url: string;
    venue_name: string;
    like_count: number;
    comment_count: number;
    bookmarked_at: string;
    collection_id: string | null;
}

interface Collection {
    id: string;
    name: string;
}

type TabId = 'all' | string;

export default function SavedScreen() {
    const nav = useNavigation<any>();
    const { colors } = useTheme();
    const styles = useMemo(() => makeStyles(colors), [colors]);
    const { width } = useWindowDimensions();

    const [collections, setCollections] = useState<Collection[]>([]);
    const [posts, setPosts] = useState<SavedPost[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<TabId>('all');

    const tileSize = (width - 3) / 2;

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [cols, saved] = await Promise.all([
                api.getCollections(),
                api.getSavedPosts(),
            ]);
            setCollections(cols);
            setPosts((saved.posts ?? []) as SavedPost[]);
        } catch {
            setCollections([]);
            setPosts([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useFocusEffect(useCallback(() => {
        loadData();
    }, [loadData]));

    const visiblePosts = useMemo(() => {
        if (activeTab === 'all') return posts;
        if (activeTab === 'none') return posts.filter((p) => p.collection_id === null);
        return posts.filter((p) => p.collection_id === activeTab);
    }, [posts, activeTab]);

    const handleDeleteCollection = useCallback((col: Collection) => {
        Alert.alert(
            `Delete "${col.name}"?`,
            'Saved posts in this collection will move to All Saved.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await api.deleteCollection(col.id);
                            setCollections((prev) => prev.filter((c) => c.id !== col.id));
                            setPosts((prev) => prev.map((p) =>
                                p.collection_id === col.id ? { ...p, collection_id: null } : p
                            ));
                            if (activeTab === col.id) setActiveTab('all');
                        } catch {
                            Alert.alert('Error', 'Could not delete collection');
                        }
                    },
                },
            ]
        );
    }, [activeTab]);

    const handleUnsave = useCallback((post: SavedPost) => {
        Alert.alert(
            'Remove from Saved?',
            undefined,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Remove',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await api.unbookmarkFeedPost(post.id);
                            setPosts((prev) => prev.filter((p) => p.id !== post.id));
                        } catch {
                            Alert.alert('Error', 'Could not remove post');
                        }
                    },
                },
            ]
        );
    }, []);

    const renderItem = useCallback(({ item }: { item: SavedPost }) => (
        <TouchableOpacity
            style={[styles.tile, { width: tileSize, height: tileSize }]}
            onLongPress={() => handleUnsave(item)}
            activeOpacity={0.9}
            delayLongPress={400}
        >
            <Image source={{ uri: item.image_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            <View style={styles.tileOverlay}>
                <Text style={styles.tileName} numberOfLines={1}>{item.venue_name}</Text>
            </View>
        </TouchableOpacity>
    ), [styles, tileSize, handleUnsave]);

    return (
        <View style={[styles.root, { backgroundColor: colors.bg }]}>
            <SafeAreaView edges={['top']}>
                <View style={styles.header}>
                    <TouchableOpacity
                        style={styles.backBtn}
                        onPress={() => nav.goBack()}
                        activeOpacity={0.8}
                    >
                        <ChevronLeft size={22} color={colors.textPrimary} />
                    </TouchableOpacity>
                    <Text style={[styles.title, { color: colors.textPrimary }]}>Saved</Text>
                    <View style={{ width: 40 }} />
                </View>

                {/* Collection tabs */}
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.tabsRow}
                >
                    <TouchableOpacity
                        style={[styles.tab, activeTab === 'all' && styles.tabActive]}
                        onPress={() => setActiveTab('all')}
                        activeOpacity={0.8}
                    >
                        <Text style={[styles.tabText, activeTab === 'all' && { color: colors.primary }]}>
                            All Saved
                        </Text>
                    </TouchableOpacity>

                    {collections.map((col) => (
                        <TouchableOpacity
                            key={col.id}
                            style={[styles.tab, activeTab === col.id && styles.tabActive]}
                            onPress={() => setActiveTab(col.id)}
                            onLongPress={() => handleDeleteCollection(col)}
                            delayLongPress={500}
                            activeOpacity={0.8}
                        >
                            <Text style={[styles.tabText, activeTab === col.id && { color: colors.primary }]}>
                                {col.name}
                            </Text>
                            {activeTab === col.id && (
                                <TouchableOpacity
                                    onPress={() => handleDeleteCollection(col)}
                                    hitSlop={{ top: 8, right: 8, bottom: 8, left: 4 }}
                                >
                                    <Trash2 size={12} color={colors.danger} />
                                </TouchableOpacity>
                            )}
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            </SafeAreaView>

            {loading ? (
                <View style={styles.center}>
                    <ActivityIndicator color={colors.primary} size="large" />
                </View>
            ) : visiblePosts.length === 0 ? (
                <View style={styles.center}>
                    <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>Nothing saved yet</Text>
                    <Text style={[styles.emptySub, { color: colors.text60 }]}>
                        Tap the bookmark on any feed post to save it here
                    </Text>
                </View>
            ) : (
                <FlatList
                    data={visiblePosts}
                    keyExtractor={(item) => item.id}
                    renderItem={renderItem}
                    numColumns={2}
                    columnWrapperStyle={styles.row}
                    ItemSeparatorComponent={() => <View style={{ height: 1.5 }} />}
                    contentContainerStyle={{ paddingBottom: 100 }}
                    showsVerticalScrollIndicator={false}
                />
            )}

            {!loading && visiblePosts.length > 0 && (
                <Text style={[styles.hint, { color: colors.text40 }]}>Long-press a post to remove it</Text>
            )}

            <BottomNav />
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
            paddingHorizontal: 16,
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
        tabsRow: {
            paddingHorizontal: 16,
            paddingBottom: 12,
            gap: 8,
        },
        tab: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            paddingHorizontal: 14,
            paddingVertical: 7,
            borderRadius: radii.pill,
            backgroundColor: c.glass,
            borderWidth: 1,
            borderColor: c.glassBorder,
        },
        tabActive: {
            borderColor: c.primary,
            backgroundColor: `${c.primary}18`,
        },
        tabText: {
            fontFamily: 'Inter_600SemiBold',
            fontSize: 13,
            color: c.text60,
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
        row: {
            gap: 1.5,
        },
        tile: {
            overflow: 'hidden',
        },
        tileOverlay: {
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            padding: 8,
            backgroundColor: 'rgba(0,0,0,0.38)',
        },
        tileName: {
            color: 'white',
            fontFamily: 'Inter_600SemiBold',
            fontSize: 11,
        },
        hint: {
            textAlign: 'center',
            fontFamily: 'Inter_400Regular',
            fontSize: 11,
            paddingBottom: 4,
        },
    });
}
