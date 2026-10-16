import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { errorText } from './dialogs';
import { useTheme } from '../context/ThemeContext';
import { AppColors, radii } from '../theme';

export const SLOW_LOAD_MS = 8_000;

export function LoadError({ title, error, onRetry }: { title: string; error: unknown; onRetry: () => void }) {
    const { colors } = useTheme();
    const styles = useMemo(() => makeStyles(colors), [colors]);
    return (
        <View accessibilityRole="alert" style={styles.card}>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.body}>{errorText(error, 'Try again in a moment.')}</Text>
            <TouchableOpacity accessibilityRole="button" onPress={onRetry} activeOpacity={0.8} style={styles.retry}>
                <Text style={styles.retryText}>Try again</Text>
            </TouchableOpacity>
        </View>
    );
}

export function SlowLoadNote({ loading }: { loading: boolean }) {
    const { colors } = useTheme();
    const styles = useMemo(() => makeStyles(colors), [colors]);
    const [slow, setSlow] = useState(false);
    useEffect(() => {
        setSlow(false);
        if (!loading) return;
        const timer = setTimeout(() => setSlow(true), SLOW_LOAD_MS);
        return () => clearTimeout(timer);
    }, [loading]);
    if (!loading) return null;
    return (
        <Text role="status" accessibilityLiveRegion="polite" style={slow ? styles.slow : undefined}>
            {slow ? 'Taking longer than usual. The server may be waking up, which can take up to a minute.' : ''}
        </Text>
    );
}

function makeStyles(colors: AppColors) {
    return StyleSheet.create({
        card: {
            backgroundColor: colors.surface,
            borderRadius: radii.lg,
            padding: 20,
            gap: 8,
            marginVertical: 12,
        },
        title: { color: colors.textPrimary, fontSize: 16, fontWeight: '700' },
        body: { color: colors.text60, fontSize: 14, lineHeight: 20 },
        retry: {
            marginTop: 8,
            minHeight: 44,
            minWidth: 44,
            paddingHorizontal: 20,
            borderRadius: radii.lg,
            borderWidth: 1.5,
            borderColor: colors.primary,
            alignItems: 'center',
            justifyContent: 'center',
        },
        retryText: { color: colors.textPrimary, fontSize: 15, fontWeight: '700' },
        slow: { color: colors.text60, fontSize: 13, lineHeight: 18, textAlign: 'center', marginVertical: 8 },
    });
}
