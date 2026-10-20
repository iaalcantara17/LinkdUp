import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { rememberJoin, webSession } from '../services/joinLink';
import OnboardingScreen from '../screens/OnboardingScreen';
import LoginScreen from '../screens/LoginScreen';
import AuthCallbackScreen from '../screens/AuthCallbackScreen';
import { useTheme } from '../context/ThemeContext';

type AuthStackParamList = {
    Onboarding: undefined;
    Login: { mode?: 'login' | 'signup' };
    AuthCallback: undefined;
};

const Stack = createNativeStackNavigator<AuthStackParamList>();

export default function AuthStack() {
    const { colors } = useTheme();
    useEffect(() => {
        if (Platform.OS === 'web' && typeof location !== 'undefined') rememberJoin(location.pathname, webSession());
    }, []);
    return (
        <Stack.Navigator
            screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: colors.bg },
            }}
        >
            <Stack.Screen name="Onboarding" component={OnboardingScreen} />
            <Stack.Screen name="Login" component={LoginScreen} />
            {/* OAuth redirect landing — shown while Supabase processes the token hash */}
            <Stack.Screen name="AuthCallback" component={AuthCallbackScreen} />
        </Stack.Navigator>
    );
}
