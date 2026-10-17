import React, { ReactNode } from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../context/ThemeContext';

/**
 * 48x48 (or custom) rounded square with the brand gradient background.
 * Used throughout the Figma source for icon treatments (CalendarConfirmation
 * date/time/attendees rows, LocationPermission benefit rows, etc).
 */
export default function IconBadge({
    children,
    size = 48,
    radius = 12,
    style,
}: {
    children: ReactNode;
    size?: number;
    radius?: number;
    style?: ViewStyle;
}) {
    const { colors } = useTheme();
    return (
        <LinearGradient
            colors={colors.gradient as any}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[
                {
                    width: size,
                    height: size,
                    borderRadius: radius,
                    alignItems: 'center',
                    justifyContent: 'center',
                },
                style,
            ]}
        >
            {children}
        </LinearGradient>
    );
}
