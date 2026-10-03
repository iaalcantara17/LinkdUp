import 'react-native-url-polyfill/auto';
import React from 'react';
import { View, ActivityIndicator } from 'react-native';
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
import { darkColors } from './src/theme';

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
        <NavigationContainer theme={navTheme} linking={linking}>
            <StatusBar style={isDark ? 'light' : 'dark'} />
            <RootNavigator />
        </NavigationContainer>
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

    if (!fontsLoaded) {
        return (
            <View style={{ flex: 1, backgroundColor: darkColors.bg, alignItems: 'center', justifyContent: 'center' }}>
                <ActivityIndicator color={darkColors.primary} />
            </View>
        );
    }

    return (
        <ThemeProvider>
            <GestureHandlerRootView style={{ flex: 1 }}>
                <SafeAreaProvider>
                    <AuthProvider>
                        <HintsProvider>
                            <AppInner />
                        </HintsProvider>
                    </AuthProvider>
                </SafeAreaProvider>
            </GestureHandlerRootView>
        </ThemeProvider>
    );
}
