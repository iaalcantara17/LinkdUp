import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import GradientButton from '../components/GradientButton';
import CrewMap from '../components/CrewMap';
import { api } from '../services/api';
import { typography, radii } from '../theme';
import type { AppColors } from '../theme';
import { useTheme } from '../context/ThemeContext';

const { height: WINDOW_HEIGHT } = Dimensions.get('window');

export default function CrewMapRevealScreen() {
    const nav = useNavigation<any>();
    const route = useRoute<any>();
    const partyId: string = route.params.partyId;
    const { colors } = useTheme();
    const styles = useMemo(() => makeStyles(colors), [colors]);

    const [mapMembers, setMapMembers] = useState<any[]>([]);
    const [midpoint, setMidpoint] = useState<{ lat: number; lng: number } | null>(null);
    const [memberCount, setMemberCount] = useState(0);
    const [showMidpoint, setShowMidpoint] = useState(false);
    const [showButton, setShowButton] = useState(false);
    const advancedRef = useRef(false);

    useEffect(() => {
        Promise.all([
            api.getParty(partyId).catch(() => null),
            api.getMembers(partyId).catch(() => []),
        ]).then(([partyData, members]) => {
            const party = partyData?.party;
            if (party?.midpoint_lat) {
                setMidpoint({ lat: party.midpoint_lat, lng: party.midpoint_lng });
            }
            const located = (members ?? [])
                .filter((m: any) => m.display_lat != null && m.display_lng != null)
                .map((m: any) => ({
                    user_id: m.user_id,
                    display_name: m.users?.display_name ?? '?',
                    avatar_url: m.users?.avatar_url ?? null,
                    avatar_color: m.users?.avatar_color ?? null,
                    display_lat: m.display_lat,
                    display_lng: m.display_lng,
                }));
            setMapMembers(located);
            setMemberCount((members ?? []).length);
        });
    }, [partyId]);

    useEffect(() => {
        const t1 = setTimeout(() => setShowMidpoint(true), 1500);
        return () => clearTimeout(t1);
    }, []);

    useEffect(() => {
        if (!showMidpoint) return;
        const t2 = setTimeout(() => setShowButton(true), 2000);
        return () => clearTimeout(t2);
    }, [showMidpoint]);

    const advance = useCallback(() => {
        if (advancedRef.current) return;
        advancedRef.current = true;
        nav.replace('Swipe', { partyId });
    }, [nav, partyId]);

    useEffect(() => {
        if (!showButton) return;
        const t3 = setTimeout(advance, 3000);
        return () => clearTimeout(t3);
    }, [showButton, advance]);

    return (
        <View style={styles.root}>
            <CrewMap
                members={mapMembers}
                midpoint={midpoint}
                height={WINDOW_HEIGHT}
                showMidpoint={showMidpoint}
                radiusMeters={10000}
            />

            <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
                <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']} pointerEvents="box-none">
                    <LinearGradient
                        colors={['rgba(10,10,15,0.85)', 'transparent']}
                        style={styles.topGradient}
                        pointerEvents="none"
                    >
                        <Animated.Text entering={FadeInDown.duration(500)} style={styles.heading}>
                            Meeting up with {memberCount} {memberCount === 1 ? 'person' : 'people'}
                        </Animated.Text>
                        {showMidpoint && (
                            <Animated.Text entering={FadeIn.duration(400)} style={styles.subheading}>
                                Midpoint found - finding spots nearby...
                            </Animated.Text>
                        )}
                    </LinearGradient>

                    <View style={{ flex: 1 }} pointerEvents="none" />

                    {showButton && (
                        <Animated.View entering={FadeIn.duration(400)} style={styles.bottomSection} pointerEvents="box-none">
                            <LinearGradient
                                colors={['transparent', 'rgba(10,10,15,0.95)']}
                                style={styles.bottomGradient}
                            >
                                <GradientButton
                                    title="Let's find a spot!"
                                    onPress={advance}
                                />
                                <Text style={styles.autoHint}>Auto-advancing in 3s...</Text>
                            </LinearGradient>
                        </Animated.View>
                    )}
                </SafeAreaView>
            </View>
        </View>
    );
}

function makeStyles(c: AppColors) {
    return StyleSheet.create({
        root: { flex: 1, backgroundColor: c.bg },
        topGradient: {
            paddingHorizontal: 24,
            paddingTop: 16,
            paddingBottom: 48,
        },
        heading: {
            color: 'white',
            fontFamily: 'Inter_900Black',
            fontSize: 28,
            marginBottom: 8,
        },
        subheading: {
            color: 'rgba(255,255,255,0.60)',
            fontFamily: 'Inter_400Regular',
            fontSize: 14,
        },
        bottomSection: {
            width: '100%',
        },
        bottomGradient: {
            paddingHorizontal: 24,
            paddingTop: 48,
            paddingBottom: 24,
            gap: 12,
        },
        autoHint: {
            color: 'rgba(255,255,255,0.40)',
            fontFamily: 'Inter_400Regular',
            fontSize: 12,
            textAlign: 'center',
        },
    });
}
