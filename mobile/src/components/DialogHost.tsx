import React, { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { AccessibilityInfo, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { AppColors, radii, spacing, typography } from '../theme';
import { claimHost, dismiss, dismissToast, getSnapshot, respond, subscribe } from './dialogs';

let hostSeq = 0;

export default function DialogHost() {
    const { colors } = useTheme();
    const styles = useMemo(() => makeStyles(colors), [colors]);
    const insets = useSafeAreaInsets();
    const [hostId] = useState(() => ++hostSeq);
    const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
    const active = snap.host === hostId;
    const dialog = active ? snap.dialog : null;
    const toasts = active ? snap.toasts : [];
    const latest = toasts[toasts.length - 1];

    useEffect(() => claimHost(hostId), [hostId]);

    useEffect(() => {
        if (latest && Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(latest.message);
    }, [latest?.id]);

    const stacked = (dialog?.buttons.length ?? 0) !== 2;
    const titleId = dialog ? `dialog-title-${dialog.id}` : undefined;
    const messageId = dialog?.message ? `dialog-message-${dialog.id}` : undefined;

    return (
        <>
            <Modal
                visible={!!dialog}
                transparent
                animationType={Platform.OS === 'ios' ? 'none' : 'fade'}
                onRequestClose={dismiss}
            >
                <View style={styles.backdrop}>
                    {dialog?.role === 'dialog' && (
                        <Pressable style={StyleSheet.absoluteFill} onPress={dismiss} accessible={false} tabIndex={-1} />
                    )}
                    {dialog && (
                        <View
                            key={dialog.id}
                            style={styles.card}
                            role={dialog.role}
                            aria-modal
                            aria-labelledby={titleId}
                            aria-describedby={messageId}
                            accessibilityViewIsModal
                        >
                            <Text nativeID={titleId} role="heading" style={styles.title}>{dialog.title}</Text>
                            {!!dialog.message && <Text nativeID={messageId} style={styles.message}>{dialog.message}</Text>}
                            <View style={stacked ? styles.stack : styles.row}>
                                {dialog.buttons.map((b, i) => (
                                    <Pressable
                                        key={`${i}-${b.label}`}
                                        role="button"
                                        accessibilityLabel={b.label}
                                        onPress={() => respond(i)}
                                        style={({ pressed }) => [
                                            styles.button,
                                            !stacked && styles.rowButton,
                                            b.style === 'cancel' && styles.cancel,
                                            b.style === 'destructive' && styles.destructive,
                                            pressed && styles.pressed,
                                        ]}
                                    >
                                        <Text style={[styles.buttonText, b.style === 'cancel' && styles.cancelText]}>{b.label}</Text>
                                    </Pressable>
                                ))}
                            </View>
                        </View>
                    )}
                </View>
            </Modal>
            <View
                pointerEvents="box-none"
                style={[styles.toastLayer, { bottom: insets.bottom + 96 }]}
                role="status"
                aria-live="polite"
                accessibilityLiveRegion="polite"
            >
                {toasts.map((t) => (
                    <Pressable
                        key={t.id}
                        onPress={() => dismissToast(t.id)}
                        accessibilityHint="Dismisses this message"
                        style={styles.toast}
                    >
                        <View style={[styles.dot, { backgroundColor: t.tone === 'success' ? colors.success : colors.primary }]} />
                        <Text style={styles.toastText}>{t.message}</Text>
                    </Pressable>
                ))}
            </View>
        </>
    );
}

function makeStyles(c: AppColors) {
    return StyleSheet.create({
        backdrop: {
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.55)',
            alignItems: 'center',
            justifyContent: 'center',
            padding: spacing.md,
        },
        card: {
            width: '100%',
            maxWidth: 400,
            backgroundColor: c.surface,
            borderRadius: radii.lg,
            borderWidth: 1,
            borderColor: c.glassBorderStrong,
            padding: spacing.lg,
        },
        title: { ...typography.h3, color: c.textPrimary },
        message: { ...typography.body, color: c.textSecondary, marginTop: spacing.sm, lineHeight: 22 },
        row: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
        stack: { gap: spacing.sm, marginTop: spacing.lg },
        button: {
            minHeight: 48,
            minWidth: 44,
            borderRadius: radii.md,
            backgroundColor: c.primary,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: spacing.md,
        },
        rowButton: { flex: 1 },
        cancel: { backgroundColor: c.glassStrong },
        destructive: { backgroundColor: c.dangerStrong },
        pressed: { opacity: 0.8 },
        buttonText: { ...typography.bodyBold, color: '#FFFFFF' },
        cancelText: { color: c.textPrimary },
        toastLayer: {
            position: 'absolute',
            left: spacing.md,
            right: spacing.md,
            alignItems: 'center',
            gap: spacing.sm,
        },
        toast: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.sm,
            minHeight: 44,
            maxWidth: 480,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm + 2,
            borderRadius: radii.pill,
            backgroundColor: c.surfaceElevated,
            borderWidth: 1,
            borderColor: c.glassBorderStrong,
        },
        dot: { width: 8, height: 8, borderRadius: 4 },
        toastText: { ...typography.bodyMed, color: c.textPrimary, flexShrink: 1 },
    });
}
