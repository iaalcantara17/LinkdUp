import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation, useNavigationState } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';

const SUPPRESSED_SCREENS = new Set(['LocationPermission', 'Walkthrough', 'CompleteProfile', 'AuthCallback']);

export default function LocationBanner() {
    const { userProfile } = useAuth();
    const nav = useNavigation<any>();

    const activeRouteName = useNavigationState(state => {
        if (!state) return null;
        const route = state.routes[state.index];
        return route?.name ?? null;
    });

    if (userProfile?.location_permission_status !== 'maybe_later') return null;
    if (activeRouteName && SUPPRESSED_SCREENS.has(activeRouteName)) return null;

    return (
        <TouchableOpacity
            style={styles.banner}
            onPress={() => nav.navigate('LocationPermission')}
            activeOpacity={0.85}
        >
            <Text style={styles.text}>📍 Location access is off. Some features won't work.</Text>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    banner: {
        backgroundColor: '#F59E0B',
        paddingVertical: 10,
        paddingHorizontal: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    text: {
        color: '#1A1A1A',
        fontFamily: 'Inter_600SemiBold',
        fontSize: 13,
        textAlign: 'center',
    },
});
