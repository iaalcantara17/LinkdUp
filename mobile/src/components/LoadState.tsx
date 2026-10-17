import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { errorText } from './dialogs';
import { useTheme } from '../context/ThemeContext';
import { ColorRoles, radius, space, typeScale } from '../theme';

const SLOW_LOAD_MS = 8_000;

export function LoadError({ title, error, onRetry }: { title: string; error: unknown; onRetry: () => void }) {
    const { roles } = useTheme();
    const styles = useMemo(() => makeStyles(roles), [roles]);
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
    const { roles } = useTheme();
    const styles = useMemo(() => makeStyles(roles), [roles]);
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

function makeStyles(r: ColorRoles) {
    return StyleSheet.create({
        card: {
            backgroundColor: r.surface,
            borderRadius: radius.lg,
            padding: space.s5,
            gap: space.s2,
            marginVertical: space.s3,
        },
        title: { ...typeScale.bodyStrong, color: r.text },
        body: { ...typeScale.footnote, color: r.textMuted },
        retry: {
            marginTop: space.s2,
            minHeight: 44,
            minWidth: 44,
            paddingHorizontal: space.s5,
            borderRadius: radius.lg,
            borderWidth: 1.5,
            borderColor: r.primary,
            alignItems: 'center',
            justifyContent: 'center',
        },
        retryText: { ...typeScale.bodyStrong, color: r.text },
        slow: { ...typeScale.footnote, color: r.textMuted, textAlign: 'center', marginVertical: space.s2 },
    });
}
