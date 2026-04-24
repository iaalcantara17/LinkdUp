import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Sparkles } from 'lucide-react-native';
import { colors } from '../../theme';

export default function SlideOneVisual() {
    return (
        <View style={styles.backdrop}>
            <Sparkles size={80} color={colors.primary} />
        </View>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        width: 160,
        height: 160,
        borderRadius: 80,
        backgroundColor: 'rgba(108,62,244,0.15)',
        borderWidth: 1,
        borderColor: 'rgba(108,62,244,0.22)',
        alignItems: 'center',
        justifyContent: 'center',
    },
});
