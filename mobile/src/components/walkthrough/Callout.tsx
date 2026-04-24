import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface Props {
    text: string;
    position?: 'top' | 'bottom';
}

export default function Callout({ text, position = 'bottom' }: Props) {
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

const styles = StyleSheet.create({
    wrapper: { alignItems: 'center' },
    pill: {
        backgroundColor: 'rgba(255,255,255,0.12)',
        borderRadius: 20,
        paddingHorizontal: 12,
        paddingVertical: 5,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.18)',
    },
    label: { color: 'rgba(255,255,255,0.85)', fontFamily: 'Inter_600SemiBold', fontSize: 11 },
    arrowUp: {
        width: 0,
        height: 0,
        borderLeftWidth: 5,
        borderRightWidth: 5,
        borderBottomWidth: 7,
        borderLeftColor: 'transparent',
        borderRightColor: 'transparent',
        borderBottomColor: 'rgba(255,255,255,0.18)',
    },
    arrowDown: {
        width: 0,
        height: 0,
        borderLeftWidth: 5,
        borderRightWidth: 5,
        borderTopWidth: 7,
        borderLeftColor: 'transparent',
        borderRightColor: 'transparent',
        borderTopColor: 'rgba(255,255,255,0.18)',
    },
});
