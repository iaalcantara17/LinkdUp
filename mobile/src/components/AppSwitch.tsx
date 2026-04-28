import React, { useEffect, useRef } from 'react';
import { Animated, TouchableOpacity, StyleSheet } from 'react-native';

interface AppSwitchProps {
    value: boolean;
    onValueChange: (v: boolean) => void;
    disabled?: boolean;
    trackOnColor?: string;
    trackOffColor?: string;
    thumbColor?: string;
}

const TRACK_WIDTH = 51;
const TRACK_HEIGHT = 31;
const THUMB_SIZE = 27;
const THUMB_TRAVEL = TRACK_WIDTH - THUMB_SIZE - 4;

export default function AppSwitch({
    value,
    onValueChange,
    disabled = false,
    trackOnColor = '#6C3EF4',
    trackOffColor = 'rgba(255,255,255,0.10)',
    thumbColor = '#FFFFFF',
}: AppSwitchProps) {
    const pos = useRef(new Animated.Value(value ? THUMB_TRAVEL : 2)).current;
    const trackOpacity = useRef(new Animated.Value(value ? 1 : 0)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.spring(pos, {
                toValue: value ? THUMB_TRAVEL : 2,
                useNativeDriver: true,
                bounciness: 4,
            }),
            Animated.timing(trackOpacity, {
                toValue: value ? 1 : 0,
                duration: 150,
                useNativeDriver: false,
            }),
        ]).start();
    }, [value]);

    return (
        <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => !disabled && onValueChange(!value)}
            style={[styles.track, { backgroundColor: trackOffColor }, disabled && { opacity: 0.4 }]}
            accessibilityRole="switch"
            accessibilityState={{ checked: value, disabled }}
        >
            <Animated.View
                style={[
                    StyleSheet.absoluteFill,
                    styles.trackOverlay,
                    { backgroundColor: trackOnColor, opacity: trackOpacity },
                ]}
            />
            <Animated.View
                style={[
                    styles.thumb,
                    { backgroundColor: thumbColor, transform: [{ translateX: pos }] },
                ]}
            />
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    track: {
        width: TRACK_WIDTH,
        height: TRACK_HEIGHT,
        borderRadius: TRACK_HEIGHT / 2,
        justifyContent: 'center',
        overflow: 'hidden',
    },
    trackOverlay: {
        borderRadius: TRACK_HEIGHT / 2,
    },
    thumb: {
        width: THUMB_SIZE,
        height: THUMB_SIZE,
        borderRadius: THUMB_SIZE / 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.25,
        shadowRadius: 2,
        elevation: 2,
    },
});
