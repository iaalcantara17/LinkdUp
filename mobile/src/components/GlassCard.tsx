import React, { ReactNode, useMemo } from 'react';
import { View, ViewStyle, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { radii } from '../theme';
import { useTheme } from '../context/ThemeContext';

interface Props {
    children: ReactNode;
    style?: ViewStyle;
    padding?: number;
    radius?: number;
}

export default function GlassCard({ children, style, padding = 20, radius = radii.xl }: Props) {
    const { isDark, colors } = useTheme();
    const styles = useMemo(() => makeStyles(colors), [colors]);

    return (
        <BlurView intensity={20} tint={isDark ? 'dark' : 'light'} style={[styles.card, { borderRadius: radius }, style]}>
            <View style={{ padding, borderRadius: radius, backgroundColor: colors.glass }}>{children}</View>
        </BlurView>
    );
}

function makeStyles(c: ReturnType<typeof useTheme>['colors']) {
    return StyleSheet.create({
        card: {
            borderWidth: 1,
            borderColor: c.glassBorder,
            overflow: 'hidden',
        },
    });
}
