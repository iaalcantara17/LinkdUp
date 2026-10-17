import React, { ReactNode, useMemo } from 'react';
import { Text, TouchableOpacity, ViewStyle, ActivityIndicator, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { AppColors, ColorRoles, elevation, palette, radius, space, typeScale } from '../theme';
import { useTheme } from '../context/ThemeContext';

interface Props {
    title: string;
    onPress: () => void;
    loading?: boolean;
    disabled?: boolean;
    variant?: 'gradient' | 'ghost' | 'white';
    leftIcon?: ReactNode;
    rightIcon?: ReactNode;
    style?: ViewStyle;
    size?: 'md' | 'lg';
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
}: Props) {
    const { colors, roles } = useTheme();
    const styles = useMemo(() => makeStyles(colors, roles), [colors, roles]);
    const isDisabled = disabled || loading;
    const padV = size === 'lg' ? space.s4 : space.s3;

    const content = (
        <View style={styles.inner}>
            {leftIcon}
            {loading ? (
                <ActivityIndicator color={variant === 'white' ? palette.black : variant === 'ghost' ? roles.text : roles.onPrimary} />
            ) : (
                <Text
                    style={[
                        styles.text,
                        variant === 'white' && { color: palette.black },
                        variant === 'ghost' && { color: roles.text },
                        isDisabled && variant !== 'white' && { color: roles.textFaint },
                    ]}
                >
                    {title}
                </Text>
            )}
            {rightIcon}
        </View>
    );

    if (variant === 'ghost') {
        return (
            <TouchableOpacity
                onPress={onPress}
                disabled={isDisabled}
                accessibilityRole="button"
                accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
                activeOpacity={0.8}
                style={[styles.base, styles.ghost, { paddingVertical: padV }, isDisabled && { opacity: 0.5 }, style]}
            >
                {content}
            </TouchableOpacity>
        );
    }

    if (variant === 'white') {
        return (
            <TouchableOpacity
                onPress={onPress}
                disabled={isDisabled}
                accessibilityRole="button"
                accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
                activeOpacity={0.85}
                style={[styles.base, styles.white, { paddingVertical: padV }, isDisabled && { opacity: 0.5 }, style]}
            >
                {content}
            </TouchableOpacity>
        );
    }

    return (
        <TouchableOpacity onPress={onPress} disabled={isDisabled} accessibilityRole="button" accessibilityState={{ disabled: !!isDisabled, busy: !!loading }} activeOpacity={0.85} style={style}>
            <LinearGradient
                colors={isDisabled ? [colors.glassStrong, colors.glassStrong] : (colors.gradient as any)}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[styles.base, { paddingVertical: padV }]}
            >
                {content}
            </LinearGradient>
        </TouchableOpacity>
    );
}

function makeStyles(c: AppColors, r: ColorRoles) {
    return StyleSheet.create({
        base: {
            borderRadius: radius.lg,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: space.s6,
            ...elevation[2],
        },
        ghost: {
            backgroundColor: c.glass,
            borderWidth: 1,
            borderColor: r.border,
        },
        white: {
            backgroundColor: palette.white,
        },
        inner: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: space.s2,
        },
        text: {
            ...typeScale.subtitle,
            color: r.onPrimary,
        },
    });
}
