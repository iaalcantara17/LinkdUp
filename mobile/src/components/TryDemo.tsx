import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { api } from '../services/api';
import { supabase } from '../services/supabase';
import { useTheme } from '../context/ThemeContext';
import GradientButton from './GradientButton';
import { errorText } from './dialogs';
import { ColorRoles, space, typeScale } from '../theme';

export default function TryDemo() {
    const { roles } = useTheme();
    const styles = useMemo(() => makeStyles(roles), [roles]);
    const [available, setAvailable] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let live = true;
        api.demoAvailable()
            .then((r) => { if (live) setAvailable(!!r?.available); })
            .catch(() => {});
        return () => { live = false; };
    }, []);

    if (!available) return null;

    const start = async () => {
        setBusy(true);
        setError(null);
        try {
            const { session } = await api.demo();
            await supabase.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
        } catch (e) {
            setError(errorText(e, "Couldn't open the demo. Try again."));
        } finally {
            setBusy(false);
        }
    };

    return (
        <View style={styles.wrap}>
            <GradientButton title="Try the demo" variant="ghost" onPress={start} loading={busy} />
            <Text style={styles.note}>Look around with sample data. No sign up needed.</Text>
            {error && <Text role="alert" style={styles.error}>{error}</Text>}
        </View>
    );
}

function makeStyles(r: ColorRoles) {
    return StyleSheet.create({
        wrap: { marginTop: space.s4 },
        note: { ...typeScale.footnote, color: r.textMuted, textAlign: 'center', marginTop: space.s2 },
        error: { ...typeScale.footnote, color: r.danger, textAlign: 'center', marginTop: space.s2 },
    });
}
