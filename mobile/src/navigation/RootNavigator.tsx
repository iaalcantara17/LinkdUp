import React from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity, StyleSheet } from 'react-native';
import { useAuth } from '../context/AuthContext';
import AuthStack from './AuthStack';
import MainStack from './MainStack';
import { colors, typography, radii } from '../theme';

function AccountErrorScreen({ onSignOut }: { onSignOut: () => void }) {
    return (
        <View style={styles.errorRoot}>
            <View style={styles.errorCard}>
                <Text style={styles.errorTitle}>Account setup failed</Text>
                <Text style={styles.errorBody}>
                    Something went wrong setting up your account. Please sign out and sign in again.
                </Text>
                <TouchableOpacity style={styles.signOutBtn} onPress={onSignOut} activeOpacity={0.85}>
                    <Text style={styles.signOutText}>Sign Out</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

export default function RootNavigator() {
    const { session, loading, userProfile, profileLoading, signOut } = useAuth();

    if (loading || (session && profileLoading && userProfile === null)) {
        return (
            <View style={styles.center}>
                <ActivityIndicator color={colors.primary} />
            </View>
        );
    }

    if (!session) {
        return <AuthStack key="auth" />;
    }

    // Session exists but profile could not be loaded — do not let the user proceed.
    if (!profileLoading && userProfile === null) {
        return <AccountErrorScreen onSignOut={signOut} />;
    }

    // Compute the first screen that needs completing, in strict priority order.
    let startScreen: 'CompleteProfile' | 'Walkthrough' | 'LocationPermission' | 'Home' = 'Home';

    if (userProfile) {
        const needsProfile =
            !userProfile.display_name?.trim() ||
            !userProfile.username?.trim() ||
            !userProfile.school_id;

        if (needsProfile) {
            startScreen = 'CompleteProfile';
        } else if (!userProfile.has_seen_walkthrough) {
            startScreen = 'Walkthrough';
        } else if (!userProfile.location_permission_status || userProfile.location_permission_status === 'unset') {
            startScreen = 'LocationPermission';
        }
    }

    return <MainStack key="main" startScreen={startScreen} />;
}

const styles = StyleSheet.create({
    center: {
        flex: 1,
        backgroundColor: colors.bg,
        alignItems: 'center',
        justifyContent: 'center',
    },
    errorRoot: {
        flex: 1,
        backgroundColor: colors.bg,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
    },
    errorCard: {
        backgroundColor: colors.surface,
        borderRadius: radii.xl,
        padding: 28,
        borderWidth: 1,
        borderColor: colors.glassBorder,
        alignItems: 'center',
        maxWidth: 340,
        width: '100%',
    },
    errorTitle: {
        ...typography.h2,
        color: colors.textPrimary,
        marginBottom: 12,
        textAlign: 'center',
    },
    errorBody: {
        ...typography.body,
        color: colors.text60,
        textAlign: 'center',
        marginBottom: 24,
        lineHeight: 22,
    },
    signOutBtn: {
        backgroundColor: colors.danger,
        borderRadius: radii.pill,
        paddingHorizontal: 28,
        paddingVertical: 12,
    },
    signOutText: {
        color: 'white',
        fontFamily: 'Inter_700Bold',
        fontSize: 15,
    },
});
