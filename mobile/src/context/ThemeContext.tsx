import React, { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { darkColors, lightColors, AppColors } from '../theme';
import { api } from '../services/api';

export type ThemeMode = 'dark' | 'light' | 'system';

interface ThemeContextValue {
    mode: ThemeMode;
    isDark: boolean;
    colors: AppColors;
    setMode: (m: ThemeMode) => Promise<void>;
    syncFromProfile: (pref: string) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
    mode: 'dark',
    isDark: true,
    colors: darkColors,
    setMode: async () => {},
    syncFromProfile: () => {},
});

function readStored(): ThemeMode {
    if (typeof localStorage !== 'undefined') {
        return (localStorage.getItem('linkdup_theme') as ThemeMode) ?? 'dark';
    }
    return 'dark';
}

function writeStored(m: ThemeMode) {
    if (typeof localStorage !== 'undefined') {
        localStorage.setItem('linkdup_theme', m);
    }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
    const systemScheme = useColorScheme();
    const [mode, setMode_] = useState<ThemeMode>(readStored);

    const isDark = mode === 'system' ? systemScheme !== 'light' : mode === 'dark';
    const colors = isDark ? darkColors : lightColors;

    const setMode = useCallback(async (m: ThemeMode) => {
        setMode_(m);
        writeStored(m);
        try {
            await api.updateProfile({ theme_preference: m });
        } catch {}
    }, []);

    const syncFromProfile = useCallback((pref: string) => {
        const m = (pref as ThemeMode) ?? 'dark';
        setMode_(m);
        writeStored(m);
    }, []);

    return (
        <ThemeContext.Provider value={{ mode, isDark, colors, setMode, syncFromProfile }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    return useContext(ThemeContext);
}
