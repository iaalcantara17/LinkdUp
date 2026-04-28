import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    View, Text, Modal, TouchableOpacity, StyleSheet,
    TextInput, ScrollView, Image, Alert, ActivityIndicator,
    KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { X, Trash2, Send } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { api } from '../services/api';
import { radii } from '../theme';
import type { AppColors } from '../theme';
import { useTheme } from '../context/ThemeContext';

interface Comment {
    id: string;
    post_id: string;
    author_id: string;
    author_display_name: string;
    author_username: string | null;
    author_avatar_url: string | null;
    body: string;
    created_at: string;
}

interface Props {
    postId: string;
    visible: boolean;
    onClose: () => void;
    currentUserId: string | null;
    initialCommentCount: number;
    onCommentCountChange: (delta: number) => void;
}

function relativeTime(iso: string): string {
    const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
}

export default function CommentSheet({
    postId, visible, onClose, currentUserId, initialCommentCount, onCommentCountChange,
}: Props) {
    const { colors } = useTheme();
    const styles = useMemo(() => makeStyles(colors), [colors]);

    const [comments, setComments] = useState<Comment[]>([]);
    const [loading, setLoading] = useState(false);
    const [draft, setDraft] = useState('');
    const [posting, setPosting] = useState(false);
    const inputRef = useRef<TextInput>(null);

    const loadComments = useCallback(async () => {
        setLoading(true);
        try {
            const data = await api.getFeedComments(postId);
            setComments(data as Comment[]);
        } catch (e) {
            console.error('[comments] load failed', e);
        } finally {
            setLoading(false);
        }
    }, [postId]);

    useEffect(() => {
        if (visible) loadComments();
    }, [visible, loadComments]);

    const handleSend = async () => {
        const trimmed = draft.trim();
        if (!trimmed || posting) return;
        setPosting(true);

        const optimistic: Comment = {
            id: `optimistic_${Date.now()}`,
            post_id: postId,
            author_id: currentUserId ?? '',
            author_display_name: 'You',
            author_username: null,
            author_avatar_url: null,
            body: trimmed,
            created_at: new Date().toISOString(),
        };
        setComments((prev) => [optimistic, ...prev]);
        setDraft('');
        onCommentCountChange(1);

        try {
            const real = await api.addFeedComment(postId, trimmed) as Comment;
            setComments((prev) =>
                prev.map((c) => (c.id === optimistic.id ? real : c))
            );
        } catch (e: any) {
            setComments((prev) => prev.filter((c) => c.id !== optimistic.id));
            onCommentCountChange(-1);
            Alert.alert('Error', e?.message ?? 'Could not post comment');
        } finally {
            setPosting(false);
        }
    };

    const handleDelete = (comment: Comment) => {
        Alert.alert('Delete comment?', 'This cannot be undone.', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Delete',
                style: 'destructive',
                onPress: async () => {
                    setComments((prev) => prev.filter((c) => c.id !== comment.id));
                    onCommentCountChange(-1);
                    try {
                        await api.deleteFeedComment(comment.id);
                    } catch (e: any) {
                        setComments((prev) => [comment, ...prev]);
                        onCommentCountChange(1);
                        Alert.alert('Error', e?.message ?? 'Could not delete comment');
                    }
                },
            },
        ]);
    };

    const commentCount = comments.length;

    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            onRequestClose={onClose}
        >
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={{ flex: 1 }}
            >
                <TouchableOpacity
                    style={styles.backdrop}
                    activeOpacity={1}
                    onPress={onClose}
                />
                <SafeAreaView style={styles.sheet} edges={['bottom']}>
                    <View style={styles.header}>
                        <Text style={styles.title}>
                            Comments{commentCount > 0 ? ` (${commentCount})` : ''}
                        </Text>
                        <TouchableOpacity onPress={onClose} activeOpacity={0.8} hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}>
                            <X size={20} color={colors.text60} />
                        </TouchableOpacity>
                    </View>

                    {loading ? (
                        <View style={styles.centered}>
                            <ActivityIndicator color={colors.primary} />
                        </View>
                    ) : comments.length === 0 ? (
                        <View style={styles.centered}>
                            <Text style={styles.emptyText}>Be the first to comment</Text>
                        </View>
                    ) : (
                        <ScrollView
                            style={{ flex: 1 }}
                            contentContainerStyle={styles.listContent}
                            showsVerticalScrollIndicator={false}
                            keyboardShouldPersistTaps="handled"
                        >
                            {comments.map((c) => (
                                <View key={c.id} style={styles.commentRow}>
                                    {c.author_avatar_url ? (
                                        <Image
                                            source={{ uri: c.author_avatar_url }}
                                            style={styles.avatar}
                                        />
                                    ) : (
                                        <LinearGradient
                                            colors={colors.gradient as any}
                                            style={styles.avatar}
                                        />
                                    )}
                                    <View style={{ flex: 1 }}>
                                        <View style={styles.commentMeta}>
                                            <Text style={styles.commentAuthor}>
                                                @{c.author_username ?? c.author_display_name.toLowerCase().replace(/\s+/g, '')}
                                            </Text>
                                            <Text style={styles.commentTime}>
                                                {relativeTime(c.created_at)}
                                            </Text>
                                        </View>
                                        <Text style={styles.commentBody}>{c.body}</Text>
                                    </View>
                                    {c.author_id === currentUserId && (
                                        <TouchableOpacity
                                            onPress={() => handleDelete(c)}
                                            activeOpacity={0.8}
                                            hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                                            style={{ marginLeft: 8 }}
                                        >
                                            <Trash2 size={16} color={colors.danger} />
                                        </TouchableOpacity>
                                    )}
                                </View>
                            ))}
                        </ScrollView>
                    )}

                    <View style={styles.inputRow}>
                        <TextInput
                            ref={inputRef}
                            style={styles.input}
                            placeholder="Add a comment…"
                            placeholderTextColor={colors.text40}
                            value={draft}
                            onChangeText={(t) => t.length <= 500 && setDraft(t)}
                            multiline
                            maxLength={500}
                            returnKeyType="default"
                        />
                        <View style={styles.inputRight}>
                            {draft.length > 400 && (
                                <Text style={styles.charCount}>{500 - draft.length}</Text>
                            )}
                            <TouchableOpacity
                                onPress={handleSend}
                                disabled={!draft.trim() || posting}
                                activeOpacity={0.8}
                            >
                                <LinearGradient
                                    colors={(!draft.trim() || posting) ? ['#444', '#444'] : (colors.gradient as any)}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 0 }}
                                    style={styles.sendBtn}
                                >
                                    {posting
                                        ? <ActivityIndicator size="small" color="white" />
                                        : <Send size={16} color="white" />
                                    }
                                </LinearGradient>
                            </TouchableOpacity>
                        </View>
                    </View>
                </SafeAreaView>
            </KeyboardAvoidingView>
        </Modal>
    );
}

function makeStyles(c: AppColors) {
    return StyleSheet.create({
        backdrop: {
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.5)',
        },
        sheet: {
            backgroundColor: c.surface,
            borderTopLeftRadius: radii.xl,
            borderTopRightRadius: radii.xl,
            maxHeight: '70%',
            minHeight: 320,
        },
        header: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 20,
            paddingVertical: 16,
            borderBottomWidth: 1,
            borderBottomColor: c.glassBorder,
        },
        title: {
            color: c.textPrimary,
            fontFamily: 'Inter_700Bold',
            fontSize: 16,
        },
        centered: {
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            paddingVertical: 40,
        },
        emptyText: {
            color: c.text40,
            fontFamily: 'Inter_400Regular',
            fontSize: 14,
        },
        listContent: {
            paddingHorizontal: 20,
            paddingVertical: 12,
            gap: 16,
        },
        commentRow: {
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: 12,
        },
        avatar: {
            width: 32,
            height: 32,
            borderRadius: 16,
        },
        commentMeta: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            marginBottom: 2,
        },
        commentAuthor: {
            color: c.textPrimary,
            fontFamily: 'Inter_700Bold',
            fontSize: 13,
        },
        commentTime: {
            color: c.text40,
            fontFamily: 'Inter_400Regular',
            fontSize: 12,
        },
        commentBody: {
            color: c.text80,
            fontFamily: 'Inter_400Regular',
            fontSize: 14,
            lineHeight: 20,
        },
        inputRow: {
            flexDirection: 'row',
            alignItems: 'flex-end',
            paddingHorizontal: 16,
            paddingVertical: 12,
            borderTopWidth: 1,
            borderTopColor: c.glassBorder,
            gap: 10,
        },
        input: {
            flex: 1,
            backgroundColor: c.glassStrong,
            borderRadius: radii.lg,
            paddingHorizontal: 14,
            paddingVertical: 10,
            color: c.textPrimary,
            fontFamily: 'Inter_400Regular',
            fontSize: 14,
            maxHeight: 100,
            borderWidth: 1,
            borderColor: c.glassBorder,
        },
        inputRight: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
        },
        charCount: {
            color: c.text40,
            fontFamily: 'Inter_400Regular',
            fontSize: 11,
        },
        sendBtn: {
            width: 40,
            height: 40,
            borderRadius: 20,
            alignItems: 'center',
            justifyContent: 'center',
        },
    });
}
