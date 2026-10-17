import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { AppColors, ColorRoles } from '../../theme';
import { useTheme } from '../../context/ThemeContext';

interface Props {
    text: string;
    position?: 'top' | 'bottom';
}

export default function Callout({ text, position = 'bottom' }: Props) {
    const { colors, roles: r } = useTheme();
    const styles = useMemo(() => makeStyles(colors, r), [colors, r]);
    return (
        <View style={styles.wrapper}>
            {position === 'top' && <View style={styles.arrowUp} />}
            <View style={styles.pill}>
                <Text style={styles.label}>{text}</Text>
            </View>
            {position === 'bottom' && <View style={styles.arrowDown} />}
        </View>
    );
}

function makeStyles(colors: AppColors, r: ColorRoles) {
    return StyleSheet.create({
        wrapper: { alignItems: 'center' },
        pill: {
            backgroundColor: r.fillStrong,
            borderRadius: 20,
            paddingHorizontal: 12,
            paddingVertical: 5,
            borderWidth: 1,
            borderColor: r.borderStrong,
        },
        label: { color: r.text, fontFamily: 'Inter_600SemiBold', fontSize: 11 },
        arrowUp: {
            width: 0,
            height: 0,
            borderLeftWidth: 5,
            borderRightWidth: 5,
            borderBottomWidth: 7,
            borderLeftColor: 'transparent',
            borderRightColor: 'transparent',
            borderBottomColor: r.borderStrong,
        },
        arrowDown: {
            width: 0,
            height: 0,
            borderLeftWidth: 5,
            borderRightWidth: 5,
            borderTopWidth: 7,
            borderLeftColor: 'transparent',
            borderRightColor: 'transparent',
            borderTopColor: r.borderStrong,
        },
    });
}
