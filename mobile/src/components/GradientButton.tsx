import React, { ReactNode, cloneElement, isValidElement, useMemo } from 'react';
import { Text, TouchableOpacity, ViewStyle, ActivityIndicator, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { AppColors, ColorRoles, elevation, palette, radius, space, typeScale } from '../theme';
import { useTheme } from '../context/ThemeContext';

type Variant = 'gradient' | 'ghost' | 'white';

interface Props {
    title: string;
    onPress: () => void;
    loading?: boolean;
    disabled?: boolean;
    variant?: Variant;
    leftIcon?: ReactNode;
    rightIcon?: ReactNode;
    style?: ViewStyle;
    size?: 'md' | 'lg';
    accessibilityLabel?: string;
}

export function buttonColors(variant: Variant, disabled: boolean, c: AppColors, r: ColorRoles) {
    if (variant === 'white') return { fill: [palette.white, palette.white], text: palette.black };
    if (variant === 'ghost') return { fill: [c.glass, c.glass], text: disabled ? r.textFaint : r.text };
    return disabled ? { fill: [c.glassStrong, c.glassStrong], text: r.textFaint } : { fill: [...c.gradient], text: r.onPrimary };
}

function tint(icon: ReactNode, color: string) {
    return isValidElement<{ color?: string }>(icon) && 'color' in icon.props ? cloneElement(icon, { color }) : icon;
}

export default function GradientButton({
    title,
    onPress,
    loading,
    disabled,
    variant = 'gradient',
    leftIcon,
    rightIcon,
    style,
    size = 'lg',
    accessibilityLabel,
}: Props) {
    const { colors, roles } = useTheme();
    const styles = useMemo(() => makeStyles(roles), [roles]);
    const isDisabled = !!(disabled || loading);
    const { fill, text } = buttonColors(variant, isDisabled, colors, roles);
    const padV = size === 'lg' ? space.s4 : space.s3;

    return (
        <TouchableOpacity
            onPress={onPress}
            disabled={isDisabled}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
            accessibilityState={{ disabled: isDisabled, busy: !!loading }}
            activeOpacity={0.85}
            style={[variant !== 'gradient' && isDisabled && { opacity: 0.5 }, style]}
        >
            <LinearGradient
                colors={fill as any}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[styles.base, variant === 'ghost' && styles.ghost, { paddingVertical: padV }]}
            >
                <View style={styles.inner}>
                    {tint(leftIcon, text)}
                    {loading ? <ActivityIndicator color={text} /> : <Text style={[styles.text, { color: text }]}>{title}</Text>}
                    {tint(rightIcon, text)}
                </View>
            </LinearGradient>
        </TouchableOpacity>
    );
}

function makeStyles(r: ColorRoles) {
    return StyleSheet.create({
        base: {
            borderRadius: radius.lg,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: space.s6,
            ...elevation[2],
        },
        ghost: {
            borderWidth: 1,
            borderColor: r.border,
        },
        inner: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: space.s2,
        },
        text: {
            ...typeScale.subtitle,
            textAlign: 'center',
        },
    });
}
