import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    View, Text, Modal, TouchableOpacity, StyleSheet,
    TextInput, ScrollView, ActivityIndicator,
    KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { X, Bookmark, Plus, FolderPlus } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { api } from '../services/api';
import { radii } from '../theme';
import type { AppColors } from '../theme';
import { useTheme } from '../context/ThemeContext';

interface Collection {
    id: string;
    name: string;
    created_at: string;
}

interface Props {
    postId: string | null;
    visible: boolean;
    onClose: () => void;
    onSaved: (postId: string, collectionId?: string | null) => void;
}

export default function BookmarkSheet({ postId, visible, onClose, onSaved }: Props) {
    const { colors } = useTheme();
    const styles = useMemo(() => makeStyles(colors), [colors]);

    const [collections, setCollections] = useState<Collection[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [creating, setCreating] = useState(false);
    const [newName, setNewName] = useState('');

    useEffect(() => {
        if (!visible) return;
        setCreating(false);
        setNewName('');
        setLoading(true);
        api.getCollections()
            .then(setCollections)
            .catch(() => setCollections([]))
            .finally(() => setLoading(false));
    }, [visible]);

    const save = useCallback(async (collectionId?: string | null) => {
        if (!postId || saving) return;
        setSaving(true);
        try {
            await api.bookmarkFeedPost(postId, collectionId);
            onSaved(postId, collectionId);
        } catch {
            // parent will show toast on save, silently fail here
            onClose();
        } finally {
            setSaving(false);
        }
    }, [postId, saving, onSaved, onClose]);

    const handleCreateAndSave = useCallback(async () => {
        const trimmed = newName.trim();
        if (!trimmed || saving) return;
        setSaving(true);
        try {
            const col = await api.createCollection(trimmed);
            setCollections((prev) => [...prev, col]);
            await api.bookmarkFeedPost(postId!, col.id);
            onSaved(postId!, col.id);
        } catch {
            onClose();
        } finally {
            setSaving(false);
            setNewName('');
            setCreating(false);
        }
    }, [newName, postId, saving, onSaved, onClose]);

    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            onRequestClose={onClose}
        >
            <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <SafeAreaView style={styles.sheet} edges={['bottom']}>
                    <View style={styles.header}>
                        <Text style={styles.title}>Save to</Text>
                        <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}>
                            <X size={20} color={colors.text60} />
                        </TouchableOpacity>
                    </View>

                    <ScrollView
                        keyboardShouldPersistTaps="handled"
                        contentContainerStyle={styles.list}
                        showsVerticalScrollIndicator={false}
                    >
                        {loading ? (
                            <ActivityIndicator color={colors.primary} style={{ marginVertical: 24 }} />
                        ) : (
                            <>
                                <TouchableOpacity
                                    style={styles.row}
                                    onPress={() => save(null)}
                                    activeOpacity={0.8}
                                    disabled={saving}
                                >
                                    <View style={[styles.rowIcon, { backgroundColor: colors.glass }]}>
                                        <Bookmark size={20} color={colors.primary} />
                                    </View>
                                    <Text style={styles.rowLabel}>Quick Save</Text>
                                    <Text style={styles.rowSub}>No collection</Text>
                                </TouchableOpacity>

                                {collections.map((col) => (
                                    <TouchableOpacity
                                        key={col.id}
                                        style={styles.row}
                                        onPress={() => save(col.id)}
                                        activeOpacity={0.8}
                                        disabled={saving}
                                    >
                                        <View style={[styles.rowIcon, { backgroundColor: colors.glass }]}>
                                            <Plus size={20} color={colors.text60} />
                                        </View>
                                        <Text style={styles.rowLabel}>{col.name}</Text>
                                    </TouchableOpacity>
                                ))}

                                {creating ? (
                                    <View style={styles.newRow}>
                                        <TextInput
                                            style={[styles.newInput, { color: colors.textPrimary, borderColor: colors.glassBorder }]}
                                            placeholder="Collection name"
                                            placeholderTextColor={colors.text40}
                                            value={newName}
                                            onChangeText={setNewName}
                                            maxLength={50}
                                            autoFocus
                                            returnKeyType="done"
                                            onSubmitEditing={handleCreateAndSave}
                                        />
                                        <TouchableOpacity
                                            onPress={handleCreateAndSave}
                                            disabled={!newName.trim() || saving}
                                            activeOpacity={0.8}
                                        >
                                            <LinearGradient
                                                colors={colors.gradient as any}
                                                start={{ x: 0, y: 0 }}
                                                end={{ x: 1, y: 0 }}
                                                style={[
                                                    styles.createBtn,
                                                    (!newName.trim() || saving) && { opacity: 0.4 },
                                                ]}
                                            >
                                                <Text style={styles.createBtnText}>Save</Text>
                                            </LinearGradient>
                                        </TouchableOpacity>
                                    </View>
                                ) : (
                                    <TouchableOpacity
                                        style={styles.row}
                                        onPress={() => setCreating(true)}
                                        activeOpacity={0.8}
                                    >
                                        <View style={[styles.rowIcon, { backgroundColor: colors.glass }]}>
                                            <FolderPlus size={20} color={colors.primary} />
                                        </View>
                                        <Text style={[styles.rowLabel, { color: colors.primary }]}>New collection</Text>
                                    </TouchableOpacity>
                                )}
                            </>
                        )}
                    </ScrollView>
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
            maxHeight: '65%',
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
        list: {
            paddingBottom: 8,
        },
        row: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 14,
            paddingHorizontal: 20,
            paddingVertical: 14,
            borderBottomWidth: 1,
            borderBottomColor: c.glassBorder,
        },
        rowIcon: {
            width: 40,
            height: 40,
            borderRadius: 12,
            alignItems: 'center',
            justifyContent: 'center',
        },
        rowLabel: {
            flex: 1,
            color: c.textPrimary,
            fontFamily: 'Inter_600SemiBold',
            fontSize: 15,
        },
        rowSub: {
            color: c.text40,
            fontFamily: 'Inter_400Regular',
            fontSize: 13,
        },
        newRow: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            paddingHorizontal: 20,
            paddingVertical: 14,
            borderBottomWidth: 1,
            borderBottomColor: c.glassBorder,
        },
        newInput: {
            flex: 1,
            fontFamily: 'Inter_400Regular',
            fontSize: 15,
            borderWidth: 1,
            borderRadius: 10,
            paddingHorizontal: 12,
            paddingVertical: 8,
        },
        createBtn: {
            paddingHorizontal: 18,
            paddingVertical: 10,
            borderRadius: 20,
        },
        createBtnText: {
            color: 'white',
            fontFamily: 'Inter_700Bold',
            fontSize: 13,
        },
    });
}
