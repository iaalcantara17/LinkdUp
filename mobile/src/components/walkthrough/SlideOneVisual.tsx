import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Sparkles } from '../icons';
import type { AppColors, ColorRoles } from '../../theme';
import { useTheme } from '../../context/ThemeContext';

export default function SlideOneVisual() {
    const { colors, roles: r } = useTheme();
    const styles = useMemo(() => makeStyles(colors, r), [colors, r]);
    return (
        <View style={styles.backdrop}>
            <Sparkles size={80} color={colors.primary} />
        </View>
    );
}

function makeStyles(colors: AppColors, r: ColorRoles) {
    return StyleSheet.create({
        backdrop: {
            width: 160,
            height: 160,
            borderRadius: 80,
            backgroundColor: r.primarySoft,
            borderWidth: 1,
            borderColor: r.primaryBorder,
            alignItems: 'center',
            justifyContent: 'center',
        },
    });
}
