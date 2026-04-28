import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { supabase } from '../services/supabase';
import { typography } from '../theme';
import type { AppColors } from '../theme';
import { useTheme } from '../context/ThemeContext';

export default function AuthCallbackScreen() {
    const { session } = useAuth();
    const nav = useNavigation<any>();
    const { colors } = useTheme();
    const styles = useMemo(() => makeStyles(colors), [colors]);

    const [status, setStatus] = useState('Connecting your Google account...');
    const handledRef = useRef(false);

    useEffect(() => {
        if (!session || handledRef.current) return;
        handledRef.current = true;

        (async () => {
            try {
                setStatus('Setting up your profile...');

                const user = session.user;
                const email = user.email ?? '';
                const displayName =
                    user.user_metadata?.full_name ??
                    user.user_metadata?.name ??
                    email.split('@')[0] ??
                    'User';

                const profile = await api.ensureProfile({ email, display_name: displayName });

                const needsCompletion = !profile.graduation_year || !profile.school_id;
                if (needsCompletion) {
                    setTimeout(() => {
                        try { nav.navigate('CompleteProfile'); } catch { /* already on it */ }
                    }, 200);
                }
            } catch (e: any) {
                console.error('[auth-callback]', e?.message);
                Alert.alert('Sign-in error', e?.message ?? 'Could not complete sign-in. Please try again.');
                try { nav.navigate('Login', { mode: 'login' }); } catch {}
            }
        })();
    }, [session, nav]);

    useEffect(() => {
        const t = setTimeout(async () => {
            if (handledRef.current) return;
            const { data } = await supabase.auth.getSession();
            if (!data.session) {
                Alert.alert('Sign-in timed out', 'Please try again.');
                try { nav.navigate('Login', { mode: 'login' }); } catch {}
            }
        }, 15_000);
        return () => clearTimeout(t);
    }, [nav]);

    return (
        <View style={styles.root}>
            <SafeAreaView style={styles.inner}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={styles.status}>{status}</Text>
            </SafeAreaView>
        </View>
    );
}

function makeStyles(c: AppColors) {
    return StyleSheet.create({
        root:   { flex: 1, backgroundColor: c.bg },
        inner:  { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20 },
        status: { ...typography.body, color: c.text60, textAlign: 'center', marginTop: 8 },
    });
}
