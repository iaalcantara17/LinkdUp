import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { MapPin, Search } from 'lucide-react-native';
import GlassCard from './GlassCard';
import GradientButton from './GradientButton';
import { useTheme } from '../context/ThemeContext';
import type { AppColors } from '../theme';
import { api, MyLocation, VENUE_LIMIT_MESSAGE } from '../services/api';
import { chooseLocation, choiceLabel, AskReason } from '../services/locationChoice';
import { getLiveLocation } from '../services/liveLocation';

const ASK_COPY: Record<AskReason, string> = {
    prompt: 'LinkdUp uses where you are right now to find a fair midpoint. Your crew only sees an approximate spot.',
    denied: 'Location is off for LinkdUp. Turn it on in your browser or phone settings, or pick a place instead.',
    unavailable: "We couldn't find where you are. Try again, or pick a place instead.",
    timeout: 'Finding your location took too long. Try again, or pick a place instead.',
};

type Props = { partyId: string; myLocation: MyLocation | null; onChanged: () => void };

export default function LocationSourceCard({ partyId, myLocation, onChanged }: Props) {
    const { colors } = useTheme();
    const styles = useMemo(() => makeStyles(colors), [colors]);
    const [liveIssue, setLiveIssue] = useState<AskReason | null>(null);
    const [busy, setBusy] = useState(false);
    const [searchOpen, setSearchOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [preview, setPreview] = useState<{ latitude: number; longitude: number; label: string } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const tried = useRef(false);

    const custom = myLocation?.custom_label ? { label: myLocation.custom_label } : null;
    const live = myLocation?.live_fresh ? { ok: true as const } : liveIssue ? { ok: false as const, reason: liveIssue } : null;
    const choice = chooseLocation({ preferCustom: myLocation?.mode === 'custom', live, custom });

    const takeLive = useCallback(async (prompt: boolean) => {
        setBusy(true);
        setError(null);
        try {
            const r = await getLiveLocation({ prompt });
            if (!r.ok) {
                setLiveIssue(r.reason);
                if (prompt && myLocation?.custom_label) setError(ASK_COPY[r.reason]);
                return;
            }
            await api.setPartyLocation(partyId, { mode: 'live', ...r.coords });
            setLiveIssue(null);
            setSearchOpen(false);
            onChanged();
        } catch {
            setError("Couldn't save your location. Check your connection and try again.");
        } finally {
            setBusy(false);
        }
    }, [partyId, onChanged, myLocation?.custom_label]);

    useEffect(() => {
        if (!myLocation || tried.current) return;
        tried.current = true;
        if (myLocation.mode === 'custom' && myLocation.custom_label) return;
        takeLive(false);
    }, [myLocation, takeLive]);

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

    const confirm = async () => {
        if (!preview) return;
        setBusy(true);
        setError(null);
        try {
            await api.setPartyLocation(partyId, { mode: 'custom', ...preview });
            setSearchOpen(false);
            setPreview(null);
            setQuery('');
            onChanged();
        } catch {
            setError("Couldn't save your location. Check your connection and try again.");
        } finally {
            setBusy(false);
        }
    };

    const status = busy && choice.kind === 'ask' ? 'Finding your location…' : choiceLabel(choice);
    const detail = choice.kind === 'live'
        ? 'Using where you are right now. Your crew sees an approximate spot.'
        : choice.kind === 'custom'
            ? "Your crew's midpoint uses this place instead of where you are."
            : ASK_COPY[choice.reason];

    return (
        <GlassCard style={{ marginBottom: 24 }}>
            <View style={styles.header}>
                <MapPin size={18} color={colors.text60} />
                <Text style={styles.title} accessibilityRole="header">Your location</Text>
            </View>
            <View style={styles.statusRow}>
                <View
                    style={[styles.dot, { backgroundColor: choice.kind === 'live' ? colors.success : choice.kind === 'custom' ? colors.primary : colors.text40 }]}
                    accessibilityElementsHidden
                    importantForAccessibility="no-hide-descendants"
                />
                <Text
                    style={styles.status}
                    accessibilityLabel={`Location source: ${choice.kind === 'custom' ? `Custom, ${choice.label}` : status}`}
                    accessibilityLiveRegion="polite"
                >
                    {status}
                </Text>
            </View>
            <Text style={styles.detail}>{detail}</Text>

            <View style={styles.actions}>
                {choice.kind === 'ask' && (
                    <GradientButton
                        size="md"
                        title={choice.reason === 'prompt' ? 'Use my live location' : 'Try again'}
                        onPress={() => takeLive(true)}
                        loading={busy}
                    />
                )}
                {choice.kind === 'custom' && (
                    <GradientButton size="md" variant="ghost" title="Switch to live location" onPress={() => takeLive(true)} loading={busy} />
                )}
                {!searchOpen && (
                    <GradientButton size="md" variant="ghost" title="Use a different location" onPress={() => setSearchOpen(true)} disabled={busy} />
                )}
            </View>

            {searchOpen && (
                <View style={styles.searchArea}>
                    <View style={styles.searchBox}>
                        <Search size={16} color={colors.text40} />
                        <TextInput
                            style={styles.searchInput}
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
                            <GradientButton size="md" title="Use this place" onPress={confirm} loading={busy} />
                            <GradientButton size="md" variant="ghost" title="Cancel" onPress={() => setPreview(null)} disabled={busy} />
                        </View>
                    ) : (
                        <View style={styles.actions}>
                            <GradientButton size="md" variant="ghost" title="Search" onPress={search} loading={busy} />
                            <GradientButton size="md" variant="ghost" title="Cancel" onPress={() => { setSearchOpen(false); setError(null); }} disabled={busy} />
                        </View>
                    )}
                </View>
            )}

            {error && <Text style={styles.error} accessibilityRole="alert">{error}</Text>}
        </GlassCard>
    );
}

function makeStyles(c: AppColors) {
    return StyleSheet.create({
        header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
        title: { color: c.textPrimary, fontFamily: 'Inter_700Bold', fontSize: 18 },
        statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
        dot: { width: 8, height: 8, borderRadius: 4 },
        status: { flexShrink: 1, color: c.textPrimary, fontFamily: 'Inter_700Bold', fontSize: 15 },
        detail: { color: c.text60, fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 20 },
        actions: { gap: 10, marginTop: 14 },
        searchArea: { marginTop: 14 },
        searchBox: {
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
        searchInput: { flex: 1, color: c.textPrimary, fontFamily: 'Inter_400Regular', fontSize: 15, minHeight: 44 },
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
