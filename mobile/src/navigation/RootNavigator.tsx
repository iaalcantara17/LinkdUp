import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useAuth } from '../context/AuthContext';
import AuthStack from './AuthStack';
import MainStack from './MainStack';
import { colors } from '../theme';

export default function RootNavigator() {
    const { session, loading } = useAuth();

    if (loading) {
        return (
            <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
                <ActivityIndicator color={colors.primary} />
            </View>
        );
    }

    // Using a stable key per auth-state ensures each stack is fully unmounted when
    // transitioning between authenticated/unauthenticated.  This kills any back-stack
    // history from the previous state so the hardware/gesture back button can't
    // "go back" into a screen that belongs to the other stack.
    return session ? <MainStack key="main" /> : <AuthStack key="auth" />;
}
