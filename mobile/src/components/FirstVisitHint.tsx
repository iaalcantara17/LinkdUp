import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useHints } from '../context/HintsContext';
import { radii } from '../theme';
import type { AppColors } from '../theme';
import { useTheme } from '../context/ThemeContext';

interface Props {
    screenKey: string;
    title: string;
    body: string;
    position?: 'top' | 'center' | 'bottom';
}

export default function FirstVisitHint({ screenKey, title, body, position = 'center' }: Props) {
    const { ready, hasSeen, markSeen } = useHints();
    const [visible, setVisible] = useState(false);
    const { colors } = useTheme();
    const styles = useMemo(() => makeStyles(colors), [colors]);

    useEffect(() => {
        if (!ready) return;
        if (hasSeen(screenKey)) return;
        const t = setTimeout(() => setVisible(true), 800);
        return () => clearTimeout(t);
    }, [ready]);

    const dismiss = () => {
        markSeen(screenKey);
        setVisible(false);
    };

    if (!visible) return null;

    const justifyContent =
        position === 'top'    ? 'flex-start' :
        position === 'bottom' ? 'flex-end'   : 'center';

    return (
        <Modal
            visible={visible}
            transparent
            animationType="none"
            onRequestClose={dismiss}
        >
            <View style={[styles.backdrop, { justifyContent }]}>
                <TouchableOpacity
                    style={StyleSheet.absoluteFill}
                    activeOpacity={1}
                    onPress={dismiss}
                />
                <Animated.View
                    entering={FadeIn.duration(350)}
                    style={[
                        styles.card,
                        position === 'top'    && { marginTop: 96 },
                        position === 'bottom' && { marginBottom: 96 },
                    ]}
                >
                    <Text style={styles.title}>{title}</Text>
                    <Text style={styles.body}>{body}</Text>
                    <TouchableOpacity style={styles.btn} onPress={dismiss} activeOpacity={0.8}>
                        <Text style={styles.btnText}>Got it</Text>
                    </TouchableOpacity>
                </Animated.View>
            </View>
        </Modal>
    );
}

function makeStyles(c: AppColors) {
    return StyleSheet.create({
        backdrop: {
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.55)',
            alignItems: 'center',
            paddingHorizontal: 24,
        },
        card: {
            width: '100%',
            backgroundColor: c.surfaceElevated,
            borderRadius: radii.xl,
            padding: 20,
            borderWidth: 1,
            borderColor: 'rgba(108,62,244,0.30)',
        },
        title: {
            color: c.textPrimary,
            fontFamily: 'Inter_700Bold',
            fontSize: 16,
            marginBottom: 8,
        },
        body: {
            color: c.text80,
            fontFamily: 'Inter_400Regular',
            fontSize: 14,
            lineHeight: 20,
            marginBottom: 16,
        },
        btn: {
            alignSelf: 'flex-end',
            backgroundColor: c.primary,
            paddingHorizontal: 20,
            paddingVertical: 8,
            borderRadius: radii.pill,
        },
        btnText: { color: 'white', fontFamily: 'Inter_700Bold', fontSize: 14 },
    });
}
