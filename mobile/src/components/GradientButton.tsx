import React, { ReactNode } from 'react';
import { Text, TouchableOpacity, ViewStyle, ActivityIndicator, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, radii } from '../theme';

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
    const isDisabled = disabled || loading;
    const padV = size === 'lg' ? 18 : 14;

    const content = (
        <View style={styles.inner}>
            {leftIcon}
            {loading ? (
                <ActivityIndicator color={variant === 'white' ? 'black' : 'white'} />
            ) : (
                <Text
                    style={[
                        styles.text,
                        variant === 'white' && { color: 'black' },
                        isDisabled && variant !== 'white' && { color: colors.text40 },
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
                activeOpacity={0.85}
                style={[styles.base, styles.white, { paddingVertical: padV }, isDisabled && { opacity: 0.5 }, style]}
            >
                {content}
            </TouchableOpacity>
        );
    }

    return (
        <TouchableOpacity onPress={onPress} disabled={isDisabled} activeOpacity={0.85} style={style}>
            <LinearGradient
                colors={isDisabled ? ['rgba(255,255,255,0.10)', 'rgba(255,255,255,0.10)'] : (colors.gradient as any)}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[styles.base, { paddingVertical: padV }]}
            >
                {content}
            </LinearGradient>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    base: {
        borderRadius: radii.lg, // rounded-2xl = 16
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 24,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.25,
        shadowRadius: 12,
        elevation: 8,
    },
    ghost: {
        backgroundColor: colors.glass,
        borderWidth: 1,
        borderColor: colors.glassBorder,
    },
    white: {
        backgroundColor: 'white',
    },
    inner: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
    },
    text: {
        fontFamily: 'Inter_700Bold',
        fontSize: 18,
        color: 'white',
    },
});
