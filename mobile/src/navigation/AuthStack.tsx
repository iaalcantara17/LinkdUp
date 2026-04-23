import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import OnboardingScreen from '../screens/OnboardingScreen';
import LoginScreen from '../screens/LoginScreen';
import AuthCallbackScreen from '../screens/AuthCallbackScreen';
import { colors } from '../theme';

export type AuthStackParamList = {
    Onboarding: undefined;
    Login: { mode?: 'login' | 'signup' };
    AuthCallback: undefined;
};

const Stack = createNativeStackNavigator<AuthStackParamList>();

export default function AuthStack() {
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
