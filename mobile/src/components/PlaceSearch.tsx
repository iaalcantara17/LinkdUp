import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { Search } from 'lucide-react-native';
import GradientButton from './GradientButton';
import { useTheme } from '../context/ThemeContext';
import type { AppColors } from '../theme';
import { api, VENUE_LIMIT_MESSAGE } from '../services/api';

export type Place = { latitude: number; longitude: number; label: string };

type Props = {
    confirmLabel: string;
    onPick: (place: Place) => Promise<void>;
    onCancel: () => void;
};

export default function PlaceSearch({ confirmLabel, onPick, onCancel }: Props) {
    const { colors } = useTheme();
    const styles = useMemo(() => makeStyles(colors), [colors]);
    const [query, setQuery] = useState('');
    const [preview, setPreview] = useState<Place | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const search = async () => {
        if (query.trim().length < 2) {
            setError('Type at least two letters of a city or address.');
            return;
        }
        setBusy(true);
        setError(null);
        setPreview(null);
        try {
            setPreview(await api.searchPlace(query.trim()));
        } catch (e: any) {
            const msg = String(e?.message);
            setError(
                msg === VENUE_LIMIT_MESSAGE ? 'Place search is paused for today. Try again tomorrow, or use your live location.'
                    : msg === 'place_not_found' ? "We couldn't find that place. Try a city name or a full address."
                        : msg === 'rate_limited' ? 'Too many searches. Wait a minute and try again.'
                            : "Couldn't search right now. Check your connection and try again.",
            );
        } finally {
            setBusy(false);
        }
    };

    const pick = async () => {
        if (!preview) return;
        setBusy(true);
        setError(null);
        try {
            await onPick(preview);
        } catch {
            setError("Couldn't use that place. Check your connection and try again.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <View style={styles.area}>
            <View style={styles.box}>
                <Search size={16} color={colors.text40} />
                <TextInput
                    style={styles.input}
                    placeholder="City or address"
                    placeholderTextColor={colors.text30}
                    value={query}
                    onChangeText={setQuery}
                    onSubmitEditing={search}
                    returnKeyType="search"
                    autoFocus
                    maxLength={120}
                    accessibilityLabel="Search for a city or address"
                />
            </View>
            {preview ? (
                <View style={styles.actions}>
                    <Text style={styles.preview} accessibilityLiveRegion="polite">Use {preview.label}?</Text>
                    <GradientButton size="md" title={confirmLabel} onPress={pick} loading={busy} />
                    <GradientButton size="md" variant="ghost" title="Cancel" onPress={() => setPreview(null)} disabled={busy} />
                </View>
            ) : (
                <View style={styles.actions}>
                    <GradientButton size="md" variant="ghost" title="Search" onPress={search} loading={busy} />
                    <GradientButton size="md" variant="ghost" title="Cancel" onPress={onCancel} disabled={busy} />
                </View>
            )}
            {error && <Text style={styles.error} accessibilityRole="alert">{error}</Text>}
        </View>
    );
}

function makeStyles(c: AppColors) {
    return StyleSheet.create({
        area: { marginTop: 14, alignSelf: 'stretch' },
        box: {
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: c.glass,
            borderRadius: 12,
            paddingHorizontal: 14,
            minHeight: 48,
            gap: 10,
            borderWidth: 1,
            borderColor: c.glassBorder,
        },
        input: { flex: 1, color: c.textPrimary, fontFamily: 'Inter_400Regular', fontSize: 15, minHeight: 44 },
        actions: { gap: 10, marginTop: 14 },
        preview: { color: c.textPrimary, fontFamily: 'Inter_500Medium', fontSize: 14 },
        error: {
            color: c.textPrimary,
            fontFamily: 'Inter_500Medium',
            fontSize: 13,
            lineHeight: 20,
            marginTop: 12,
            paddingLeft: 10,
            borderLeftWidth: 3,
            borderLeftColor: c.danger,
        },
    });
}
