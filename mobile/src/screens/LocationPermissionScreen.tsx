import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Alert, Platform } from 'react-native';
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
import { typography, spacing, radii } from '../theme';
import type { AppColors } from '../theme';
import { useTheme } from '../context/ThemeContext';

export default function LocationPermissionScreen() {
    const nav = useNavigation<any>();
    const { colors } = useTheme();
    const styles = useMemo(() => makeStyles(colors), [colors]);

    const [loading, setLoading] = useState(false);

    const y = useSharedValue(0);
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

    const saveLocation = async (lat: number, lng: number) => {
        await api.updateLocation(lat, lng);
        await api.setLocationPermission('granted');
    };

    const handleAllow = async () => {
        setLoading(true);
        try {
            if (Platform.OS === 'web') {
                await new Promise<void>((resolve, reject) => {
                    if (!navigator.geolocation) {
                        reject(new Error('Geolocation not supported'));
                        return;
                    }
                    navigator.geolocation.getCurrentPosition(
                        async (pos) => {
                            try {
                                await saveLocation(pos.coords.latitude, pos.coords.longitude);
                                resolve();
                            } catch (e) {
                                reject(e);
                            }
                        },
                        (err) => reject(new Error(err.message)),
                        { enableHighAccuracy: true, timeout: 10000 }
                    );
                });
            } else {
                const { status } = await Location.requestForegroundPermissionsAsync();
                if (status !== 'granted') {
                    await api.setLocationPermission('maybe_later');
                    nav.replace('Home');
                    return;
                }
                const loc = await Location.getCurrentPositionAsync({});
                await saveLocation(loc.coords.latitude, loc.coords.longitude);
            }
            if (nav.canGoBack()) nav.goBack(); else nav.replace('Home');
        } catch (e: any) {
            Alert.alert('Location error', e.message ?? 'Could not get location');
            setLoading(false);
        } finally {
            setLoading(false);
        }
    };

    const handleMaybeLater = async () => {
        try {
            await api.setLocationPermission('maybe_later');
        } catch {}
        if (nav.canGoBack()) nav.goBack(); else nav.replace('Home');
    };

    return (
        <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
            <Animated.View entering={FadeIn.duration(400)} style={styles.content}>
                <View style={styles.pinOuter}>
                    <LinearGradient
                        colors={['rgba(108,62,244,0.2)', 'rgba(0,194,255,0.2)']}
                        style={styles.pinGlow}
                    >
                        <Animated.View style={[styles.ring, ringStyle]} />
                        <Animated.View style={[styles.pinFloat, pinStyle]}>
                            <MapPin size={48} color={colors.primary} fill={colors.primary} />
                        </Animated.View>
                    </LinearGradient>
                </View>

                <Text style={styles.title}>Let us find the middle ground 📍</Text>
                <Text style={styles.body}>
                    We use your location to find spots equidistant from your crew
                </Text>

                <View style={styles.benefits}>
                    <View style={styles.benefitRow}>
                        <IconBadge size={32} radius={16}>
                            <Navigation size={16} color="white" />
                        </IconBadge>
                        <View style={styles.benefitText}>
                            <Text style={styles.benefitTitle}>Fair for everyone</Text>
                            <Text style={styles.benefitDesc}>Find spots that work for the whole group</Text>
                        </View>
                    </View>
                    <View style={[styles.benefitRow, styles.benefitRowGap]}>
                        <IconBadge size={32} radius={16}>
                            <MapPin size={16} color="white" />
                        </IconBadge>
                        <View style={styles.benefitText}>
                            <Text style={styles.benefitTitle}>Discover nearby gems</Text>
                            <Text style={styles.benefitDesc}>Get personalized venue recommendations</Text>
                        </View>
                    </View>
                </View>

                <GradientButton title="Allow Location" onPress={handleAllow} loading={loading} />
                <Text style={styles.maybeLater} onPress={handleMaybeLater}>
                    Maybe Later
                </Text>

                <Text style={styles.privacy}>
                    Your location is only used while using the app and is never shared with other users
                </Text>
            </Animated.View>
        </SafeAreaView>
    );
}

function makeStyles(c: AppColors) {
    return StyleSheet.create({
        root: { flex: 1, backgroundColor: c.bg },
        content: { flex: 1, paddingHorizontal: 24, justifyContent: 'center' },

        pinOuter: { alignItems: 'center', marginBottom: 28 },
        pinGlow: {
            width: 160,
            height: 160,
            borderRadius: 80,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: c.glassBorder,
        },
        ring: {
            position: 'absolute',
            width: 80,
            height: 80,
            borderRadius: 40,
            backgroundColor: c.primary,
        },
        pinFloat: { alignItems: 'center', justifyContent: 'center' },

        title: {
            ...typography.h1,
            color: c.textPrimary,
            textAlign: 'center',
            marginBottom: 8,
            fontSize: 24,
            fontFamily: 'Inter_900Black',
        },
        body: {
            color: c.text60,
            textAlign: 'center',
            marginBottom: 20,
            fontSize: 14,
            fontFamily: 'Inter_500Medium',
        },

        benefits: {
            backgroundColor: c.glass,
            borderRadius: 16,
            padding: 16,
            borderWidth: 1,
            borderColor: c.glassBorder,
            marginBottom: 24,
        },
        benefitRow: { flexDirection: 'row', alignItems: 'flex-start' },
        benefitRowGap: { marginTop: 12 },
        benefitText: { flex: 1, marginLeft: 12 },
        benefitTitle: { color: c.textPrimary, fontFamily: 'Inter_700Bold', fontSize: 14, marginBottom: 2 },
        benefitDesc: { color: c.text60, fontSize: 12, fontFamily: 'Inter_400Regular' },

        maybeLater: {
            color: c.textPrimary,
            textAlign: 'center',
            marginTop: 14,
            fontSize: 14,
            fontFamily: 'Inter_500Medium',
            paddingVertical: 12,
        },

        privacy: {
            color: c.text40,
            fontSize: 12,
            textAlign: 'center',
            marginTop: 12,
            fontFamily: 'Inter_400Regular',
        },
    });
}
