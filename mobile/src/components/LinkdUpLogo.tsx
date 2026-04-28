import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import MaskedView from '@react-native-masked-view/masked-view';
import { darkColors as colors } from '../theme';

// Note: MaskedView requires @react-native-masked-view/masked-view as a dep.
// If you skip that dep, the fallback below renders a solid white wordmark.
export default function LinkdUpLogo({ size = 48 }: { size?: number }) {
    try {
        return (
            <MaskedView maskElement={<Text style={[styles.text, { fontSize: size }]}>LINKDUP</Text>}>
                <LinearGradient colors={colors.gradient as any} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                    <Text style={[styles.text, { fontSize: size, opacity: 0 }]}>LINKDUP</Text>
                </LinearGradient>
            </MaskedView>
        );
    } catch {
        return <Text style={[styles.text, { fontSize: size }]}>LINKDUP</Text>;
    }
}

const styles = StyleSheet.create({
    text: { fontWeight: '900', letterSpacing: 2, color: 'white' },
});
