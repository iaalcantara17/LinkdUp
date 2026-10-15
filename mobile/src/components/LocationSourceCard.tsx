import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { MapPin } from 'lucide-react-native';
import GlassCard from './GlassCard';
import GradientButton from './GradientButton';
import PlaceSearch, { Place } from './PlaceSearch';
import { useTheme } from '../context/ThemeContext';
import type { AppColors } from '../theme';
import { api, MyLocation } from '../services/api';
import { chooseLocation, choiceLabel, pendingAction, permissionLabel, AskReason } from '../services/locationChoice';
import { getLiveLocation, useLocationPermission } from '../services/liveLocation';

const ASK_COPY: Record<AskReason, string> = {
    prompt: 'LinkdUp uses where you are right now to find a fair midpoint. Your crew only sees an approximate spot.',
    denied: 'Location is blocked for LinkdUp. Allow it in your browser or phone settings, or pick a place instead.',
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
    const [error, setError] = useState<string | null>(null);
    const tried = useRef(false);
    const nav = useNavigation<any>();
    const [afterAllow] = useState(() => pendingAction());

    const permission = useLocationPermission();
    const seenPermission = useRef(permission);
    const custom = myLocation?.custom_label ? { label: myLocation.custom_label } : null;
    const live = myLocation?.live_fresh && permission !== 'denied'
        ? { ok: true as const }
        : liveIssue ? { ok: false as const, reason: liveIssue }
            : permission === 'denied' ? { ok: false as const, reason: 'denied' as const } : null;
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

    useFocusEffect(useCallback(() => {
        afterAllow.resume(true);
    }, [afterAllow]));

    useEffect(() => {
        const prev = seenPermission.current;
        seenPermission.current = permission;
        if (prev === permission || prev === 'unknown' || busy) return;
        setError(null);
        if (permission !== 'granted') return setLiveIssue(permission === 'denied' ? 'denied' : 'prompt');
        setLiveIssue(null);
        if (myLocation?.mode !== 'custom') takeLive(false);
    }, [permission]);

    const chooseLive = () => {
        if (liveIssue === 'prompt') {
            afterAllow.arm(() => takeLive(false));
            nav.navigate('LocationPermission');
            return;
        }
        takeLive(true);
    };

    const saveCustom = async (place: Place) => {
        await api.setPartyLocation(partyId, { mode: 'custom', ...place });
        setSearchOpen(false);
        onChanged();
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
            {permissionLabel(permission) && (
                <Text style={styles.detail} accessibilityLiveRegion="polite">{permissionLabel(permission)}</Text>
            )}

            <View style={styles.actions}>
                {choice.kind === 'ask' && (
                    <GradientButton
                        size="md"
                        title={choice.reason === 'prompt' ? 'Use my live location' : 'Try again'}
                        onPress={chooseLive}
                        loading={busy}
                    />
                )}
                {choice.kind === 'custom' && (
                    <GradientButton size="md" variant="ghost" title="Use my live location" onPress={chooseLive} loading={busy} />
                )}
                {!searchOpen && (
                    <GradientButton size="md" variant="ghost" title="Use a different location" onPress={() => setSearchOpen(true)} disabled={busy} />
                )}
            </View>

            {searchOpen && (
                <PlaceSearch confirmLabel="Use this place" onPick={saveCustom} onCancel={() => { setSearchOpen(false); setError(null); }} />
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
