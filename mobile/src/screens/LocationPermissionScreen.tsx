import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Alert, TextInput } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withRepeat,
    withSequence,
    withTiming,
    FadeIn,
} from 'react-native-reanimated';
import { MapPin, Navigation } from 'lucide-react-native';
import GradientButton from '../components/GradientButton';
import IconBadge from '../components/IconBadge';
import { api } from '../services/api';
import { colors, typography, spacing, radii } from '../theme';

export default function LocationPermissionScreen() {
    const nav = useNavigation<any>();
    const [loading, setLoading] = useState(false);
    const [showManual, setShowManual] = useState(false);
    const [city, setCity] = useState('');

    // Floating pin animation
    const y = useSharedValue(0);
    // Pulsing ring animation
    const ringScale = useSharedValue(1);
    const ringOpacity = useSharedValue(0.5);

    useEffect(() => {
        y.value = withRepeat(
            withSequence(withTiming(-10, { duration: 1000 }), withTiming(0, { duration: 1000 })),
            -1
        );
        ringScale.value = withRepeat(
            withSequence(withTiming(1.5, { duration: 1000 }), withTiming(1, { duration: 1000 })),
            -1
        );
        ringOpacity.value = withRepeat(
            withSequence(withTiming(0, { duration: 1000 }), withTiming(0.5, { duration: 1000 })),
            -1
        );
    }, []);

    const pinStyle = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
    const ringStyle = useAnimatedStyle(() => ({
        transform: [{ scale: ringScale.value }],
        opacity: ringOpacity.value,
    }));

    const handleAllow = async () => {
        setLoading(true);
        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                setShowManual(true);
                setLoading(false);
                return;
            }
            const loc = await Location.getCurrentPositionAsync({});
            await api.updateLocation(loc.coords.latitude, loc.coords.longitude);
            nav.replace('Home');
        } catch (e: any) {
            Alert.alert('Location error', e.message);
            setShowManual(true);
        } finally {
            setLoading(false);
        }
    };

    const handleManual = async () => {
        if (!city) return;
        setLoading(true);
        try {
            await api.updateLocationManual(city);
            nav.replace('Home');
        } catch (e: any) {
            Alert.alert('Could not find city', e.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
            <Animated.View entering={FadeIn.duration(400)} style={styles.content}>
                {/* Animated pin */}
                <View style={styles.pinOuter}>
                    <LinearGradient
                        colors={['rgba(108,62,244,0.2)', 'rgba(0,194,255,0.2)']}
                        style={styles.pinGlow}
                    >
                        <Animated.View style={[styles.pinInner, pinStyle]}>
                            <View>
                                <MapPin size={48} color={colors.primary} fill={colors.primary} />
                                <Animated.View style={[styles.ring, ringStyle]} />
                            </View>
                        </Animated.View>
                    </LinearGradient>
                </View>

                <Text style={styles.title}>Let us find the middle ground 📍</Text>
                <Text style={styles.body}>
                    We use your location to find spots equidistant from your crew
                </Text>

                {/* Benefits */}
                <View style={styles.benefits}>
                    <View style={styles.benefitRow}>
                        <IconBadge size={32} radius={16}>
                            <Navigation size={16} color="white" />
                        </IconBadge>
                        <View style={{ flex: 1, marginLeft: 12 }}>
                            <Text style={styles.benefitTitle}>Fair for everyone</Text>
                            <Text style={styles.benefitDesc}>Find spots that work for the whole group</Text>
                        </View>
                    </View>
                    <View style={[styles.benefitRow, { marginTop: 12 }]}>
                        <IconBadge size={32} radius={16}>
                            <MapPin size={16} color="white" />
                        </IconBadge>
                        <View style={{ flex: 1, marginLeft: 12 }}>
                            <Text style={styles.benefitTitle}>Discover nearby gems</Text>
                            <Text style={styles.benefitDesc}>Get personalized venue recommendations</Text>
                        </View>
                    </View>
                </View>

                {/* Actions */}
                {!showManual ? (
                    <>
                        <GradientButton title="Allow Location" onPress={handleAllow} loading={loading} />
                        <Text
                            style={styles.maybeLater}
                            onPress={() => nav.replace('Home')}
                        >
                            Maybe Later
                        </Text>
                    </>
                ) : (
                    <>
                        <TextInput
                            style={styles.cityInput}
                            placeholder="e.g. Newark, NJ"
                            placeholderTextColor={colors.text30}
                            value={city}
                            onChangeText={setCity}
                        />
                        <GradientButton title="Use this city" onPress={handleManual} loading={loading} />
                    </>
                )}

                <Text style={styles.privacy}>
                    Your location is only used while using the app and is never shared with other users
                </Text>
            </Animated.View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    content: { flex: 1, padding: 24, justifyContent: 'center' },

    pinOuter: { alignItems: 'center', marginBottom: 24 },
    pinGlow: {
        width: 160,
        height: 160,
        borderRadius: 80,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: colors.glassBorder,
    },
    pinInner: { alignItems: 'center', justifyContent: 'center' },
    ring: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: colors.primary,
        borderRadius: 999,
    },

    title: { ...typography.h1, color: 'white', textAlign: 'center', marginBottom: 8, fontSize: 24 },
    body: { ...typography.caption, color: colors.text60, textAlign: 'center', marginBottom: 20, fontSize: 14 },

    benefits: {
        backgroundColor: colors.glass,
        borderRadius: radii.lg,
        padding: 16,
        borderWidth: 1,
        borderColor: colors.glassBorder,
        marginBottom: 20,
    },
    benefitRow: { flexDirection: 'row', alignItems: 'flex-start' },
    benefitTitle: { color: 'white', fontFamily: 'Inter_700Bold', fontSize: 14, marginBottom: 2 },
    benefitDesc: { color: colors.text60, fontSize: 12, fontFamily: 'Inter_400Regular' },

    maybeLater: {
        color: colors.text60,
        textAlign: 'center',
        marginTop: 14,
        fontSize: 14,
        fontFamily: 'Inter_500Medium',
        paddingVertical: 12,
    },

    cityInput: {
        backgroundColor: colors.glassStrong,
        borderWidth: 1,
        borderColor: colors.glassBorderStrong,
        borderRadius: radii.md,
        paddingHorizontal: 16,
        paddingVertical: 16,
        color: 'white',
        fontSize: 16,
        marginBottom: 12,
        fontFamily: 'Inter_400Regular',
    },

    privacy: { color: colors.text40, fontSize: 11, textAlign: 'center', marginTop: 12, fontFamily: 'Inter_400Regular' },
});
