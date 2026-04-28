import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Platform } from 'react-native';
import { Session } from '@supabase/supabase-js';
import { supabase } from '../services/supabase';
import { api } from '../services/api';

interface AuthContextValue {
    session: Session | null;
    loading: boolean;
    signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({ session: null, loading: true, signOut: async () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(true);

    // On web: if Supabase redirected back with an OAuth hash fragment, hydrate the
    // session and provision the public.users profile before anything else renders.
    useEffect(() => {
        if (Platform.OS !== 'web') return;
        if (typeof window === 'undefined') return;
        const hash = window.location.hash;
        if (!hash.includes('access_token')) return;

        supabase.auth.getSession().then(({ data, error }) => {
            if (error) { console.error('[auth] getSession failed', error); return; }
            if (!data?.session) { console.warn('[auth] no session after hash detection'); return; }

            // Remove the hash so the tokens don't stay in the address bar or browser history.
            window.history.replaceState({}, document.title, window.location.pathname);

            const user = data.session.user;
            const displayName =
                user.user_metadata?.full_name ??
                user.user_metadata?.name ??
                user.email?.split('@')[0] ??
                'User';

            api.ensureProfile({ email: user.email!, display_name: displayName })
                .catch((e: any) => console.error('[auth] ensureProfile failed', e));
        });
    }, []);

    useEffect(() => {
        supabase.auth.getSession().then(({ data }) => {
            setSession(data.session);
            setLoading(false);
        });

        const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
            setSession(s);
            if (!s) setLoading(false); // ensure loading clears on explicit sign-out
        });

        return () => { sub.subscription.unsubscribe(); };
    }, []);

    const signOut = async () => {
        // supabase.auth.signOut() clears its own internal storage (AsyncStorage on native,
        // localStorage on web). The onAuthStateChange listener above sets session to null,
        // which causes RootNavigator to unmount MainStack and mount a fresh AuthStack.
        await supabase.auth.signOut();
    };

    return <AuthContext.Provider value={{ session, loading, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
    return useContext(AuthContext);
}
