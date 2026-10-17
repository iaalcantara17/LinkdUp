import React, { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { darkColors, lightColors, AppColors, color, ColorRoles } from '../theme';
import { api } from '../services/api';

export type ThemeMode = 'dark' | 'light' | 'system';

interface ThemeContextValue {
    mode: ThemeMode;
    isDark: boolean;
    colors: AppColors;
    roles: ColorRoles;
    setMode: (m: ThemeMode) => Promise<void>;
    syncFromProfile: (pref: string) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
    mode: 'dark',
    isDark: true,
    colors: darkColors,
    roles: color.dark,
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
    } else {
        AsyncStorage.setItem('linkdup_theme', m).catch(() => {});
    }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
    const systemScheme = useColorScheme();
    const [mode, setMode_] = useState<ThemeMode>(readStored);

    useEffect(() => {
        if (typeof localStorage !== 'undefined') return;
        AsyncStorage.getItem('linkdup_theme')
            .then((m) => { if (m === 'dark' || m === 'light' || m === 'system') setMode_(m); })
            .catch(() => {});
    }, []);

    const isDark = mode === 'system' ? systemScheme !== 'light' : mode === 'dark';
    const colors = isDark ? darkColors : lightColors;
    const roles = isDark ? color.dark : color.light;

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
        <ThemeContext.Provider value={{ mode, isDark, colors, roles, setMode, syncFromProfile }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    return useContext(ThemeContext);
}
