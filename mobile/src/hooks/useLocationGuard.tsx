import React, { useState, useCallback, useRef } from 'react';
import {
    Modal, View, Text, TouchableOpacity, StyleSheet,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Animated, {
    useSharedValue, useAnimatedStyle, withSpring, withTiming, Easing,
} from 'react-native-reanimated';
import { X, MapPin } from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import { darkColors, radii } from '../theme';

const BUBBLE_BG = darkColors.primary;

function LocationGuardBubble({
    visible,
    onDismiss,
    onEnable,
}: {
    visible: boolean;
    onDismiss: () => void;
    onEnable: () => void;
}) {
    const scale   = useSharedValue(0.88);
    const opacity = useSharedValue(0);

    React.useEffect(() => {
        if (visible) {
            opacity.value = withTiming(1, { duration: 200, easing: Easing.out(Easing.cubic) });
            scale.value   = withSpring(1, { damping: 14, stiffness: 220 });
        } else {
            opacity.value = withTiming(0, { duration: 150 });
            scale.value   = withTiming(0.88, { duration: 150 });
        }
    }, [visible]);

    const animStyle = useAnimatedStyle(() => ({
        opacity: opacity.value,
        transform: [{ scale: scale.value }],
    }));

    if (!visible) return null;

    return (
        <Modal visible transparent animationType="none" onRequestClose={onDismiss}>
            <TouchableOpacity
                style={StyleSheet.absoluteFill}
                activeOpacity={1}
                onPress={onDismiss}
            />
            <View style={styles.bubbleWrapper} pointerEvents="box-none">
                <Animated.View style={[styles.bubble, animStyle]}>
                    <TouchableOpacity style={styles.closeBtn} onPress={onDismiss} hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                        <X size={16} color="rgba(255,255,255,0.7)" />
                    </TouchableOpacity>

                    <View style={styles.bubbleIconRow}>
                        <MapPin size={22} color="white" fill="white" />
                    </View>

                    <Text style={styles.bubbleTitle}>Location required</Text>
                    <Text style={styles.bubbleBody}>
                        This feature needs your location. Tap below to enable it.
                    </Text>

                    <TouchableOpacity style={styles.enableBtn} onPress={onEnable} activeOpacity={0.85}>
                        <Text style={styles.enableBtnText}>Enable Location</Text>
                    </TouchableOpacity>
                </Animated.View>
            </View>
        </Modal>
    );
}

export function useLocationGuard() {
    const { userProfile } = useAuth();
    const nav = useNavigation<any>();
    const [showBubble, setShowBubble] = useState(false);
    const pendingCallback = useRef<(() => void) | null>(null);

    const checkLocation = useCallback((onGranted: () => void) => {
        if (userProfile?.location_permission_status === 'granted') {
            onGranted();
            return;
        }
        pendingCallback.current = onGranted;
        setShowBubble(true);
    }, [userProfile?.location_permission_status]);

    const handleDismiss = useCallback(() => {
        setShowBubble(false);
        pendingCallback.current = null;
    }, []);

    const handleEnable = useCallback(() => {
        setShowBubble(false);
        pendingCallback.current = null;
        nav.navigate('LocationPermission');
    }, [nav]);

    const GuardBubble = (
        <LocationGuardBubble
            visible={showBubble}
            onDismiss={handleDismiss}
            onEnable={handleEnable}
        />
    );

    return { checkLocation, GuardBubble };
}

const styles = StyleSheet.create({
    bubbleWrapper: {
        flex: 1,
        justifyContent: 'flex-end',
        alignItems: 'center',
        paddingBottom: 60,
        paddingHorizontal: 24,
    },
    bubble: {
        backgroundColor: BUBBLE_BG,
        borderRadius: radii.xl,
        padding: 22,
        width: '100%',
        maxWidth: 360,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.4,
        shadowRadius: 16,
        elevation: 10,
    },
    closeBtn: {
        position: 'absolute',
        top: 14,
        right: 14,
    },
    bubbleIconRow: {
        marginBottom: 10,
    },
    bubbleTitle: {
        color: 'white',
        fontFamily: 'Inter_700Bold',
        fontSize: 16,
        marginBottom: 6,
    },
    bubbleBody: {
        color: 'rgba(255,255,255,0.85)',
        fontFamily: 'Inter_400Regular',
        fontSize: 14,
        lineHeight: 20,
        marginBottom: 18,
    },
    enableBtn: {
        backgroundColor: 'white',
        borderRadius: radii.pill,
        paddingVertical: 12,
        alignItems: 'center',
    },
    enableBtnText: {
        color: BUBBLE_BG,
        fontFamily: 'Inter_700Bold',
        fontSize: 14,
    },
});
