import React, { useEffect } from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { useTheme } from '../context/ThemeContext';

interface Props {
    name: string;
    color?: string;
    size?: number;
    status?: 'waiting' | 'yes' | 'no' | null;
    avatarUrl?: string | null;
    onPress?: () => void;
    pulse?: boolean;
}

export default function AvatarBubble({ name, color, size = 40, status, avatarUrl, onPress, pulse }: Props) {
    const { colors } = useTheme();
    const bubbleColor = color ?? colors.primary;

    const initials = name
        .split(' ')
        .map((s) => s[0])
        .slice(0, 2)
        .join('')
        .toUpperCase();

    const ring = status === 'yes' ? colors.success : status === 'no' ? colors.danger : colors.glassBorder;

    const scale = useSharedValue(1);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }],
    }));

    useEffect(() => {
        if (!pulse) return;
        scale.value = withSpring(1.15, { damping: 4, stiffness: 300 }, () => {
            scale.value = withSpring(1, { damping: 6, stiffness: 200 });
        });
    }, [pulse]);

    const content = (
        <View style={{ alignItems: 'center' }}>
            <View
                style={[
                    styles.bubble,
                    { width: size, height: size, borderRadius: size / 2, backgroundColor: bubbleColor, borderColor: ring },
                ]}
            >
                {avatarUrl ? (
                    <Image
                        source={{ uri: avatarUrl }}
                        style={{ width: size, height: size, borderRadius: size / 2 }}
                        resizeMode="cover"
                    />
                ) : (
                    <Text style={[styles.text, { fontSize: size * 0.36 }]}>{initials}</Text>
                )}
            </View>
        </View>
    );

    const inner = onPress ? (
        <TouchableOpacity onPress={onPress} activeOpacity={0.75} hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}>
            {content}
        </TouchableOpacity>
    ) : content;

    return (
        <Animated.View style={animatedStyle}>
            {inner}
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    bubble: {
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        overflow: 'hidden',
    },
    text: { color: 'white', fontWeight: '700' },
});
