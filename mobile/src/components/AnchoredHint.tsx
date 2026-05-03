import React, { useEffect, useRef, useState } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, Modal,
    useWindowDimensions, ScrollView, Platform,
} from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    withSpring,
    Easing,
} from 'react-native-reanimated';
import { useIsFocused } from '@react-navigation/native';
import { useHints } from '../context/HintsContext';
import { darkColors, radii } from '../theme';

interface AnchoredHintProps {
    screenKey: string;
    title: string;
    body: string;
    targetRef: React.RefObject<any>;
    placement?: 'top' | 'bottom';
    offset?: number;
    scrollViewRef?: React.RefObject<ScrollView>;
}

const CARD_MAX_WIDTH = 260;
const EDGE_PAD = 12;
const TAIL = 9;
const CARD_BG = darkColors.primary;

export default function AnchoredHint({
    screenKey,
    title,
    body,
    targetRef,
    placement = 'bottom',
    offset = 12,
    scrollViewRef,
}: AnchoredHintProps) {
    const { ready, hasSeen, markSeen } = useHints();
    const isFocused = useIsFocused();
    const { width: screenWidth, height: screenHeight } = useWindowDimensions();
    const [rect, setRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
    const [visible, setVisible] = useState(false);
    const [backdropActive, setBackdropActive] = useState(false);

    const cardOpacity = useSharedValue(0);
    const cardScale   = useSharedValue(0.92);

    const animStyle = useAnimatedStyle(() => ({
        opacity: cardOpacity.value,
        transform: [{ scale: cardScale.value }],
    }));

    useEffect(() => {
        if (!ready || hasSeen(screenKey) || !isFocused) return;
        let cancelled = false;
        let tries = 0;

        const attempt = () => {
            if (cancelled || tries > 25) return;
            tries++;
            if (!targetRef.current) { requestAnimationFrame(attempt); return; }
            targetRef.current.measureInWindow((x: number, y: number, w: number, h: number) => {
                if (w > 0 && h > 0 && !cancelled) {
                    setRect({ x, y, w, h });
                } else if (!cancelled) {
                    requestAnimationFrame(attempt);
                }
            });
        };

        requestAnimationFrame(attempt);
        return () => { cancelled = true; };
    }, [ready, isFocused]);

    useEffect(() => {
        if (!isFocused) {
            setRect(null);
            setVisible(false);
            setBackdropActive(false);
        }
    }, [isFocused]);

    useEffect(() => {
        if (!rect || !isFocused) return;

        const elementCenterY = rect.y + rect.h / 2;
        const needsScroll = elementCenterY > screenHeight * 0.75 || rect.y < 0;

        const show = () => {
            setVisible(true);
            setBackdropActive(true);
        };

        if (needsScroll) {
            if (Platform.OS === 'web') {
                (targetRef.current as any)?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
            } else {
                scrollViewRef?.current?.scrollTo?.({ y: rect.y - 120, animated: true });
            }
            const t = setTimeout(show, 400);
            return () => clearTimeout(t);
        } else {
            const t = setTimeout(show, 600);
            return () => clearTimeout(t);
        }
    }, [rect, isFocused]);

    useEffect(() => {
        if (!visible) return;
        cardOpacity.value = withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) });
        cardScale.value   = withSpring(1, { damping: 14, stiffness: 200 });
    }, [visible]);

    const dismiss = () => {
        markSeen(screenKey);
        setVisible(false);
        setBackdropActive(false);
    };

    if (!visible || !rect) return null;

    const targetCenterX = rect.x + rect.w / 2;
    const rawLeft = targetCenterX - CARD_MAX_WIDTH / 2;
    const cardLeft = Math.max(EDGE_PAD, Math.min(rawLeft, screenWidth - CARD_MAX_WIDTH - EDGE_PAD));
    const tailLeft = Math.max(TAIL + 4, Math.min(targetCenterX - cardLeft - TAIL, CARD_MAX_WIDTH - 3 * TAIL));

    const positionStyle: any = { position: 'absolute', left: cardLeft, maxWidth: CARD_MAX_WIDTH };
    if (placement === 'bottom') {
        positionStyle.top = Math.min(rect.y + rect.h + offset, screenHeight - 120);
    } else {
        positionStyle.bottom = Math.min(screenHeight - rect.y + offset, screenHeight - 40);
    }

    const backdropPointerEvents = backdropActive ? 'auto' as const : 'none' as const;
    const tailUpStyle = { position: 'absolute' as const, top: -TAIL, left: tailLeft, width: 0, height: 0, borderLeftWidth: TAIL, borderRightWidth: TAIL, borderBottomWidth: TAIL, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: CARD_BG };
    const tailDownStyle = { position: 'absolute' as const, bottom: -TAIL, left: tailLeft, width: 0, height: 0, borderLeftWidth: TAIL, borderRightWidth: TAIL, borderTopWidth: TAIL, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: CARD_BG };

    return (
        <Modal visible transparent animationType="none" onRequestClose={dismiss}>
            <View style={{ flex: 1 }}>
                <View style={StyleSheet.absoluteFill} pointerEvents={backdropPointerEvents}>
                    <TouchableOpacity
                        style={StyleSheet.absoluteFill}
                        activeOpacity={1}
                        onPress={dismiss}
                    />
                </View>
                <Animated.View style={[positionStyle, animStyle]}>
                    <View style={styles.card} onStartShouldSetResponder={() => true}>
                        {placement === 'bottom' && <View style={tailUpStyle} />}
                        <Text style={styles.title}>{title}</Text>
                        <Text style={styles.body}>{body}</Text>
                        <TouchableOpacity style={styles.btn} onPress={dismiss} activeOpacity={0.8}>
                            <Text style={styles.btnText}>Got it</Text>
                        </TouchableOpacity>
                        {placement === 'top' && <View style={tailDownStyle} />}
                    </View>
                </Animated.View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    card: {
        backgroundColor: CARD_BG,
        borderRadius: radii.md,
        padding: 14,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.35,
        shadowRadius: 10,
        elevation: 8,
    },
    title: {
        color: 'white',
        fontFamily: 'Inter_700Bold',
        fontSize: 14,
        marginBottom: 6,
    },
    body: {
        color: 'rgba(255,255,255,0.88)',
        fontFamily: 'Inter_500Medium',
        fontSize: 13,
        lineHeight: 19,
        marginBottom: 12,
    },
    btn: {
        alignSelf: 'flex-end',
        backgroundColor: 'white',
        paddingHorizontal: 16,
        paddingVertical: 6,
        borderRadius: radii.pill,
    },
    btnText: { color: CARD_BG, fontFamily: 'Inter_700Bold', fontSize: 13 },
});
