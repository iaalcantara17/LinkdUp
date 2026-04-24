import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withRepeat,
    withSequence,
    withTiming,
    cancelAnimation,
} from 'react-native-reanimated';

interface Props {
    children: React.ReactNode;
    borderRadius?: number;
    ringPadding?: number;
}

export default function HighlightRing({ children, borderRadius = 999, ringPadding = 5 }: Props) {
    const opacity = useSharedValue(0.4);

    useEffect(() => {
        opacity.value = withRepeat(
            withSequence(
                withTiming(0.35, { duration: 900 }),
                withTiming(1.0,  { duration: 600 }),
            ),
            -1,
            false
        );
        return () => { cancelAnimation(opacity); };
    }, []);

    const ringStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

    return (
        <Animated.View style={styles.wrapper}>
            <Animated.View
                pointerEvents="none"
                style={[{
                    position: 'absolute',
                    top: -ringPadding,
                    left: -ringPadding,
                    right: -ringPadding,
                    bottom: -ringPadding,
                    borderRadius: borderRadius + ringPadding,
                    borderWidth: 2,
                    borderColor: '#6C3EF4',
                }, ringStyle]}
            />
            {children}
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    wrapper: { alignItems: 'center', justifyContent: 'center' },
});
