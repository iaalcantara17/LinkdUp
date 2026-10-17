import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { DEMO_READ_ONLY } from './dialogs';
import { Tap } from './kit';
import { ColorRoles, radius, space, typeScale } from '../theme';

export default function DemoBanner() {
    const { isDemo, signOut } = useAuth();
    const { roles } = useTheme();
    const insets = useSafeAreaInsets();
    const styles = useMemo(() => makeStyles(roles), [roles]);
    if (!isDemo) return null;
    return (
        <View role="status" accessibilityLiveRegion="polite" style={[styles.bar, { paddingTop: insets.top + space.s1 }]}>
            <Text style={styles.text}>{DEMO_READ_ONLY}</Text>
            <Tap onPress={signOut} accessibilityLabel="Sign up" style={styles.action}>
                <Text style={styles.actionText}>Sign up</Text>
            </Tap>
        </View>
    );
}

function makeStyles(r: ColorRoles) {
    return StyleSheet.create({
        bar: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.s3,
            paddingHorizontal: space.s4,
            paddingBottom: space.s1,
            backgroundColor: r.surfaceRaised,
            borderBottomWidth: 1,
            borderBottomColor: r.primaryBorder,
        },
        text: { ...typeScale.footnote, color: r.text, flex: 1 },
        action: {
            minHeight: 44,
            justifyContent: 'center',
            paddingHorizontal: space.s4,
            borderRadius: radius.pill,
            backgroundColor: r.primary,
        },
        actionText: { ...typeScale.footnote, fontFamily: 'Inter_700Bold', color: r.onPrimary },
    });
}
