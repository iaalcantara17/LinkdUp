import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { AccessibilityInfo, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { AppColors, ColorRoles, radius, space, typeScale } from '../theme';
import { claimHost, dismiss, dismissToast, getSnapshot, respond, subscribe } from './dialogs';

let hostSeq = 0;
const PRESS_GUARD_MS = 250;

export default function DialogHost() {
    const { colors, roles } = useTheme();
    const styles = useMemo(() => makeStyles(colors, roles), [colors, roles]);
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

    const shownAt = useRef(0);
    useEffect(() => {
        shownAt.current = Date.now();
    }, [dialog?.id]);
    const press = (i: number) => {
        if (Date.now() - shownAt.current >= PRESS_GUARD_MS) respond(i);
    };

    const stacked = (dialog?.buttons.length ?? 0) !== 2;
    const titleId = dialog ? `dialog-title-${dialog.id}` : undefined;
    const messageId = dialog?.message ? `dialog-message-${dialog.id}` : undefined;

    const toastLayer = (
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
                    <View style={[styles.dot, { backgroundColor: t.tone === 'success' ? roles.success : roles.primary }]} />
                    <Text style={styles.toastText}>{t.message}</Text>
                </Pressable>
            ))}
        </View>
    );

    if (!dialog) return toastLayer;

    return (
        <Modal
            visible
            transparent
            animationType={Platform.OS === 'ios' ? 'none' : 'fade'}
            onRequestClose={dismiss}
        >
            <View style={styles.backdrop}>
                {dialog.role === 'dialog' && (
                    <Pressable style={StyleSheet.absoluteFill} onPress={dismiss} accessible={false} tabIndex={-1} />
                )}
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
                                onPress={() => press(i)}
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
            </View>
            {toastLayer}
        </Modal>
    );
}

function makeStyles(c: AppColors, r: ColorRoles) {
    return StyleSheet.create({
        backdrop: {
            flex: 1,
            backgroundColor: r.scrim,
            alignItems: 'center',
            justifyContent: 'center',
            padding: space.s4,
        },
        card: {
            width: '100%',
            maxWidth: 400,
            backgroundColor: r.surface,
            borderRadius: radius.lg,
            borderWidth: 1,
            borderColor: r.borderStrong,
            padding: space.s6,
        },
        title: { ...typeScale.title, color: r.text },
        message: { ...typeScale.body, color: r.textMuted, marginTop: space.s2 },
        row: { flexDirection: 'row', gap: space.s2, marginTop: space.s6 },
        stack: { gap: space.s2, marginTop: space.s6 },
        button: {
            minHeight: 48,
            minWidth: 44,
            borderRadius: radius.md,
            backgroundColor: r.primary,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: space.s4,
        },
        rowButton: { flex: 1 },
        cancel: { backgroundColor: c.glassStrong },
        destructive: { backgroundColor: r.dangerStrong },
        pressed: { opacity: 0.8 },
        buttonText: { ...typeScale.bodyStrong, color: r.primaryText },
        cancelText: { color: r.text },
        toastLayer: {
            position: 'absolute',
            left: space.s4,
            right: space.s4,
            alignItems: 'center',
            gap: space.s2,
        },
        toast: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.s2,
            minHeight: 44,
            maxWidth: 480,
            paddingHorizontal: space.s4,
            paddingVertical: space.s2,
            borderRadius: radius.pill,
            backgroundColor: r.surfaceRaised,
            borderWidth: 1,
            borderColor: r.borderStrong,
        },
        dot: { width: space.s2, height: space.s2, borderRadius: space.s1 },
        toastText: { ...typeScale.body, color: r.text, flexShrink: 1 },
    });
}
