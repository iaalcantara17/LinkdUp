import React from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity } from 'react-native';
import { colors } from '../theme';

interface Props {
    name: string;
    color?: string;
    size?: number;
    status?: 'waiting' | 'yes' | 'no' | null;
    avatarUrl?: string | null;
    onPress?: () => void;
}

export default function AvatarBubble({ name, color = colors.primary, size = 40, status, avatarUrl, onPress }: Props) {
    const initials = name
        .split(' ')
        .map((s) => s[0])
        .slice(0, 2)
        .join('')
        .toUpperCase();

    const ring = status === 'yes' ? colors.success : status === 'no' ? colors.danger : colors.glassBorder;

    const bubble = (
        <View style={{ alignItems: 'center' }}>
            <View
                style={[
                    styles.bubble,
                    { width: size, height: size, borderRadius: size / 2, backgroundColor: color, borderColor: ring },
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

    if (onPress) {
        return (
            <TouchableOpacity onPress={onPress} activeOpacity={0.75} hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}>
                {bubble}
            </TouchableOpacity>
        );
    }

    return bubble;
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
