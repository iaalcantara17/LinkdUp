import 'react-native-url-polyfill/auto';
import React from 'react';
import { View, ActivityIndicator, Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer, DefaultTheme, LinkingOptions } from '@react-navigation/native';
import {
    useFonts,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_900Black,
} from '@expo-google-fonts/inter';
import { AuthProvider } from './src/context/AuthContext';
import { HintsProvider } from './src/context/HintsContext';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import RootNavigator from './src/navigation/RootNavigator';
import { documentTitle } from './src/navigation/titles';
import DialogHost from './src/components/DialogHost';
import { ColdStartNote } from './src/components/LoadState';
import { installWebMotion, settleFinishedAnimations } from './src/services/webAnimations';
import { inject } from '@vercel/analytics';

if (Platform.OS === 'web' && typeof document !== 'undefined') settleFinishedAnimations(document);
if (Platform.OS === 'web' && typeof document !== 'undefined') installWebMotion(document);
if (Platform.OS === 'web') inject();

const linking: LinkingOptions<any> = {
    prefixes: ['linkdup://', 'http://localhost:8081', 'exp://'],
    config: {
        screens: {
            AuthCallback: 'auth-callback',
            CompleteProfile: 'complete-profile',
        },
    },
};

function AppInner() {
    const { isDark, colors } = useTheme();

    const navTheme = {
        ...DefaultTheme,
        dark: isDark,
        colors: {
            ...DefaultTheme.colors,
            background: colors.bg,
            card: colors.surface,
            text: colors.textPrimary,
            border: colors.glassBorder,
            primary: colors.primary,
        },
    };

    return (
        <NavigationContainer theme={navTheme} linking={linking} documentTitle={{ formatter: (_, route) => documentTitle(route?.name) }}>
            <StatusBar style={isDark ? 'light' : 'dark'} />
            <RootNavigator />
        </NavigationContainer>
    );
}

function FontLoading() {
    const { colors } = useTheme();
    return (
        <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={colors.primary} />
        </View>
    );
}

export default function App() {
    const [fontsLoaded] = useFonts({
        Inter_400Regular,
        Inter_500Medium,
        Inter_600SemiBold,
        Inter_700Bold,
        Inter_900Black,
    });

    return (
        <ThemeProvider>
            {fontsLoaded ? (
                <GestureHandlerRootView style={{ flex: 1 }}>
                    <SafeAreaProvider>
                        <AuthProvider>
                            <HintsProvider>
                                <AppInner />
                                <DialogHost />
                                <ColdStartNote />
                            </HintsProvider>
                        </AuthProvider>
                    </SafeAreaProvider>
                </GestureHandlerRootView>
            ) : (
                <FontLoading />
            )}
        </ThemeProvider>
    );
}
