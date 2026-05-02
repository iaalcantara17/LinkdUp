import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { Platform } from 'react-native';
import { Session } from '@supabase/supabase-js';
import { supabase } from '../services/supabase';
import { api } from '../services/api';

export interface UserProfile {
    id: string;
    email: string;
    display_name: string | null;
    username: string | null;
    school_id: string | null;
    graduation_year: number | null;
    avatar_color: string;
    avatar_url: string | null;
    latitude: number | null;
    longitude: number | null;
    has_seen_walkthrough: boolean;
    location_permission_status: 'unset' | 'granted' | 'maybe_later';
    pronouns: string | null;
    birthday: string | null;
    bio: string | null;
    theme_preference: 'dark' | 'light' | 'system';
    google_calendar_connected: boolean;
    age: number | null;
}

interface AuthContextValue {
    session: Session | null;
    loading: boolean;
    userProfile: UserProfile | null;
    profileLoading: boolean;
    refreshProfile: () => Promise<void>;
    signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
    session: null,
    loading: true,
    userProfile: null,
    profileLoading: false,
    refreshProfile: async () => {},
    signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(true);
    const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
    const [profileLoading, setProfileLoading] = useState(false);

    const fetchProfile = useCallback(async () => {
        setProfileLoading(true);
        try {
            const data = await api.me();
            setUserProfile(data as UserProfile);
        } catch (e) {
            console.error('[AuthContext] fetchProfile failed', e);
            setUserProfile(null);
        } finally {
            setProfileLoading(false);
        }
    }, []);

    const refreshProfile = useCallback(async () => {
        await fetchProfile();
    }, [fetchProfile]);

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
            if (data.session) {
                fetchProfile();
            }
        });

        const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
            setSession(s);
            if (!s) {
                setLoading(false);
                setUserProfile(null);
            } else {
                fetchProfile();
            }
        });

        return () => { sub.subscription.unsubscribe(); };
    }, []);

    const signOut = async () => {
        await supabase.auth.signOut();
    };

    return (
        <AuthContext.Provider value={{ session, loading, userProfile, profileLoading, refreshProfile, signOut }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    return useContext(AuthContext);
}
