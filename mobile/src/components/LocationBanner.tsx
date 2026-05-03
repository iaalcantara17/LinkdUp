import React, { useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation, useNavigationState } from '@react-navigation/native';
import { X } from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';

const ALLOWED_SCREENS = new Set(['Home', 'Discover']);

export default function LocationBanner() {
    const { userProfile } = useAuth();
    const nav = useNavigation<any>();

    const dismissed = useRef(false);
    const [hidden, setHidden] = useState(false);

    const activeRouteName = useNavigationState(state => {
        if (!state) return null;
        const route = state.routes[state.index];
        return route?.name ?? null;
    });

    if (userProfile?.location_permission_status !== 'maybe_later') return null;
    if (!activeRouteName || !ALLOWED_SCREENS.has(activeRouteName)) return null;
    if (hidden || dismissed.current) return null;

    const handleDismiss = () => {
        dismissed.current = true;
        setHidden(true);
    };

    return (
        <View style={styles.wrapper}>
            <TouchableOpacity
                style={styles.pill}
                onPress={() => nav.navigate('LocationPermission')}
                activeOpacity={0.85}
            >
                <Text style={styles.text}>📍 Location off — party features need it.</Text>
                <TouchableOpacity
                    style={styles.closeBtn}
                    onPress={handleDismiss}
                    hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                >
                    <X size={13} color="#1A1A1A" />
                </TouchableOpacity>
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    wrapper: {
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingTop: 6,
        paddingBottom: 2,
    },
    pill: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F59E0B',
        borderRadius: 20,
        paddingVertical: 7,
        paddingLeft: 14,
        paddingRight: 10,
        gap: 8,
    },
    text: {
        color: '#1A1A1A',
        fontFamily: 'Inter_600SemiBold',
        fontSize: 13,
        flex: 1,
    },
    closeBtn: {
        padding: 2,
    },
});
