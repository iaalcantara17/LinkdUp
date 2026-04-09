import React, { ReactNode } from 'react';
import { View, ViewStyle, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { colors, radii } from '../theme';

interface Props {
    children: ReactNode;
    style?: ViewStyle;
    padding?: number;
    radius?: number;
}

export default function GlassCard({ children, style, padding = 20, radius = radii.xl }: Props) {
    return (
        <BlurView intensity={20} tint="dark" style={[styles.card, { borderRadius: radius }, style]}>
            <View style={{ padding, borderRadius: radius, backgroundColor: colors.glass }}>{children}</View>
        </BlurView>
    );
}

const styles = StyleSheet.create({
    card: {
        borderWidth: 1,
        borderColor: colors.glassBorder,
        overflow: 'hidden',
    },
});
