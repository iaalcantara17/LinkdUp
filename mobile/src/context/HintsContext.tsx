import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '../services/supabase';
import { api } from '../services/api';

interface HintsContextValue {
    ready: boolean;
    hasSeen: (screenKey: string) => boolean;
    markSeen: (screenKey: string) => void;
}

const HintsContext = createContext<HintsContextValue>({
    ready: false,
    hasSeen: () => true,
    markSeen: () => {},
});

export function HintsProvider({ children }: { children: ReactNode }) {
    const [seenHints, setSeenHints] = useState<Set<string>>(new Set());
    const [ready, setReady] = useState(false);

    const fetchHints = async () => {
        try {
            const keys = await api.getSeenHints();
            setSeenHints(new Set(keys));
        } catch {
            // unauthenticated or network error — keep empty set, show all hints
        } finally {
            setReady(true);
        }
    };

    useEffect(() => {
        fetchHints();
        const { data: sub } = supabase.auth.onAuthStateChange(() => {
            setReady(false);
            setSeenHints(new Set());
            fetchHints();
        });
        return () => { sub.subscription.unsubscribe(); };
    }, []);

    const hasSeen = (screenKey: string) => !ready || seenHints.has(screenKey);

    const markSeen = (screenKey: string) => {
        setSeenHints(prev => new Set([...prev, screenKey]));
        api.markHintSeen(screenKey).catch(() => {});
    };

    return (
        <HintsContext.Provider value={{ ready, hasSeen, markSeen }}>
            {children}
        </HintsContext.Provider>
    );
}

export function useHints() {
    return useContext(HintsContext);
}
