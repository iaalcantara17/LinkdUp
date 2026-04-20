import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../theme';

interface Props {
    name: string;
    color?: string;
    size?: number;
    status?: 'waiting' | 'yes' | 'no' | null;
}

export default function AvatarBubble({ name, color = colors.primary, size = 40, status }: Props) {
    const initials = name
        .split(' ')
        .map((s) => s[0])
        .slice(0, 2)
        .join('')
        .toUpperCase();

    const ring = status === 'yes' ? colors.success : status === 'no' ? colors.danger : colors.glassBorder;

    return (
        <View style={{ alignItems: 'center' }}>
            <View
                style={[
                    styles.bubble,
                    { width: size, height: size, borderRadius: size / 2, backgroundColor: color, borderColor: ring },
                ]}
            >
                <Text style={[styles.text, { fontSize: size * 0.36 }]}>{initials}</Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    bubble: {
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
    },
    text: { color: 'white', fontWeight: '700' },
});
