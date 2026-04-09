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

    return session ? <MainStack /> : <AuthStack />;
}
