import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { supabase } from '../services/supabase';
import { colors, typography } from '../theme';

// AuthCallbackScreen is the landing page after an OAuth redirect.
// On web, Supabase's client SDK auto-detects the access-token hash fragment
// and fires onAuthStateChange with a SIGNED_IN event.  This screen simply
// shows a spinner while that happens, then ensures the profile row exists
// before the RootNavigator switches to MainStack.

export default function AuthCallbackScreen() {
    const { session } = useAuth();
    const nav = useNavigation<any>();
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

                // Create or verify the public.users row (idempotent)
                const profile = await api.ensureProfile({ email, display_name: displayName });

                // Route to CompleteProfile if required fields are missing,
                // otherwise let RootNavigator's session-based switch handle it.
                const needsCompletion = !profile.graduation_year || !profile.school_id;
                if (needsCompletion) {
                    // CompleteProfile is in MainStack which will mount automatically once
                    // RootNavigator detects the session.  We store the intent via a
                    // brief navigation after the stack switch.
                    // Give RootNavigator one tick to switch stacks.
                    setTimeout(() => {
                        try { nav.navigate('CompleteProfile'); } catch { /* already on it */ }
                    }, 200);
                }
                // If profile is complete, RootNavigator shows Home automatically.
            } catch (e: any) {
                console.error('[auth-callback]', e?.message);
                Alert.alert('Sign-in error', e?.message ?? 'Could not complete sign-in. Please try again.');
                try { nav.navigate('Login', { mode: 'login' }); } catch {}
            }
        })();
    }, [session, nav]);

    // If no session after 15 s, redirect to Login
    useEffect(() => {
        const t = setTimeout(async () => {
            if (handledRef.current) return;
            // Try to get session from URL hash one more time (web)
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

const styles = StyleSheet.create({
    root:   { flex: 1, backgroundColor: colors.bg },
    inner:  { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20 },
    status: { ...typography.body, color: colors.text60, textAlign: 'center', marginTop: 8 },
});
