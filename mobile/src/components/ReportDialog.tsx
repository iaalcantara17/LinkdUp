import React, { useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { api } from '../services/api';
import { useTheme } from '../context/ThemeContext';
import { AppColors, ColorRoles, radius, space, typeScale } from '../theme';
import { Chip, Tap, TextField } from './kit';
import { errorText, toast } from './dialogs';

type Reason = 'spam' | 'harassment' | 'inappropriate' | 'other';

const REASONS: { value: Reason; label: string }[] = [
    { value: 'spam', label: 'Spam' },
    { value: 'harassment', label: 'Harassment' },
    { value: 'inappropriate', label: 'Inappropriate' },
    { value: 'other', label: 'Something else' },
];

export default function ReportDialog({ userId, name, onClose }: { userId: string; name: string; onClose: () => void }) {
    const { colors, roles } = useTheme();
    const styles = useMemo(() => makeStyles(colors, roles), [colors, roles]);
    const [reason, setReason] = useState<Reason | null>(null);
    const [details, setDetails] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const title = `Report ${name}?`;

    const send = async () => {
        if (!reason || busy) return;
        setBusy(true);
        setError(null);
        try {
            await api.reportUser(userId, reason, details.trim() || undefined);
            onClose();
            toast("Thanks, we'll take a look.");
        } catch (e: any) {
            if (e?.message === 'demo_read_only') return onClose();
            setError(errorText(e, 'Try again in a moment.'));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Modal visible transparent animationType={Platform.OS === 'ios' ? 'none' : 'fade'} onRequestClose={onClose}>
            <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessible={false} tabIndex={-1} />
                <View style={styles.card} role="dialog" aria-modal aria-labelledby="report-title" aria-describedby="report-message" accessibilityViewIsModal>
                    <Text nativeID="report-title" role="heading" style={styles.title}>{title}</Text>
                    <Text nativeID="report-message" style={styles.message}>Pick a reason. They won't know you reported them.</Text>
                    <View role="radiogroup" aria-label="Reason" style={styles.reasons}>
                        {REASONS.map((r) => (
                            <Chip key={r.value} role="radio" label={r.label} selected={reason === r.value} onPress={() => setReason(r.value)} />
                        ))}
                    </View>
                    <TextField
                        value={details}
                        onChangeText={setDetails}
                        placeholder="Add details (optional)"
                        accessibilityLabel="Details"
                        maxLength={500}
                        multiline
                        containerStyle={styles.note}
                        style={styles.noteInput}
                    />
                    {error ? (
                        <View role="alert" style={styles.error}>
                            <Text style={styles.errorTitle}>Couldn't send report</Text>
                            <Text style={styles.errorText}>{error}</Text>
                        </View>
                    ) : null}
                    <View style={styles.row}>
                        <Tap onPress={onClose} accessibilityLabel="Cancel" style={[styles.button, styles.cancel]}>
                            <Text style={[styles.buttonText, styles.cancelText]}>Cancel</Text>
                        </Tap>
                        <Tap onPress={send} disabled={!reason || busy} accessibilityLabel="Send report" style={[styles.button, (!reason || busy) && styles.disabled]}>
                            {busy ? <ActivityIndicator color={roles.onPrimary} /> : <Text style={styles.buttonText}>Send report</Text>}
                        </Tap>
                    </View>
                </View>
            </KeyboardAvoidingView>
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
        reasons: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s2, marginTop: space.s4 },
        note: { marginTop: space.s4, alignItems: 'flex-start' },
        noteInput: { minHeight: 88, textAlignVertical: 'top' },
        error: { marginTop: space.s3 },
        errorTitle: { ...typeScale.bodyStrong, color: r.danger },
        errorText: { ...typeScale.footnote, color: r.textMuted, marginTop: space.s1 },
        row: { flexDirection: 'row', gap: space.s2, marginTop: space.s6 },
        button: {
            flex: 1,
            minHeight: 48,
            borderRadius: radius.md,
            backgroundColor: r.primary,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: space.s4,
        },
        cancel: { backgroundColor: c.glassStrong },
        disabled: { opacity: 0.5 },
        buttonText: { ...typeScale.bodyStrong, color: r.onPrimary },
        cancelText: { color: r.text },
    });
}
