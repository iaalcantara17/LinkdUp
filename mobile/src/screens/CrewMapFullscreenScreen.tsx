import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useWindowDimensions } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft } from 'lucide-react-native';
import CrewMap from '../components/CrewMap';
import { api } from '../services/api';
import { radii } from '../theme';
import type { AppColors } from '../theme';
import { useTheme } from '../context/ThemeContext';

export default function CrewMapFullscreenScreen() {
    const nav = useNavigation<any>();
    const route = useRoute<any>();
    const partyId: string = route.params.partyId;
    const { height: screenHeight } = useWindowDimensions();
    const { colors } = useTheme();
    const styles = useMemo(() => makeStyles(colors), [colors]);

    const [mapMembers, setMapMembers] = useState<any[]>([]);
    const [midpoint, setMidpoint] = useState<{ lat: number; lng: number } | null>(null);
    const [radiusMeters, setRadiusMeters] = useState(10000);
    const [partyName, setPartyName] = useState<string | null>(null);
    const [memberCount, setMemberCount] = useState(0);
    const [showMidpoint, setShowMidpoint] = useState(false);

    useEffect(() => {
        Promise.all([
            api.getParty(partyId).catch(() => null),
            api.getMembers(partyId).catch(() => []),
        ]).then(([partyData, members]) => {
            const party = partyData?.party;
            setPartyName(party?.name ?? null);
            setMemberCount((members ?? []).length);
            if (party?.midpoint_lat) {
                setMidpoint({ lat: party.midpoint_lat, lng: party.midpoint_lng });
                setShowMidpoint(true);
                setRadiusMeters(party.search_radius_meters ?? 10000);
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
        });
    }, [partyId]);

    const mapHeight = Math.max(200, screenHeight - 160);
    const radiusMiles = (radiusMeters / 1609.34).toFixed(1);

    return (
        <View style={styles.root}>
            <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => nav.goBack()} style={styles.backBtn}>
                        <ArrowLeft size={22} color={colors.textPrimary} />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle} numberOfLines={1}>
                        {partyName ?? 'Party Map'}
                    </Text>
                    <View style={{ width: 40 }} />
                </View>

                <CrewMap
                    members={mapMembers}
                    midpoint={midpoint}
                    height={mapHeight}
                    showMidpoint={showMidpoint}
                    radiusMeters={radiusMeters}
                    scrollWheelZoom
                />

                <View style={styles.legend}>
                    <Text style={styles.legendText}>
                        {memberCount} {memberCount === 1 ? 'person' : 'people'}
                        {showMidpoint
                            ? `  ·  midpoint shown  ·  ~${radiusMiles} mi radius`
                            : '  ·  midpoint not yet calculated'}
                    </Text>
                    <Text style={styles.legendNote}>Locations are approximate for privacy.</Text>
                </View>
            </SafeAreaView>
        </View>
    );
}

function makeStyles(c: AppColors) {
    return StyleSheet.create({
        root: { flex: 1, backgroundColor: c.bg },
        header: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 16,
            paddingVertical: 10,
            borderBottomWidth: 1,
            borderBottomColor: c.glassBorder,
        },
        backBtn: {
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: c.glass,
            alignItems: 'center',
            justifyContent: 'center',
        },
        headerTitle: {
            color: c.textPrimary,
            fontFamily: 'Inter_700Bold',
            fontSize: 17,
            flex: 1,
            textAlign: 'center',
            paddingHorizontal: 8,
        },
        legend: {
            paddingHorizontal: 20,
            paddingVertical: 12,
            borderTopWidth: 1,
            borderTopColor: c.glassBorder,
            alignItems: 'center',
        },
        legendText: {
            color: c.text80,
            fontFamily: 'Inter_500Medium',
            fontSize: 13,
            textAlign: 'center',
        },
        legendNote: {
            color: c.text40,
            fontFamily: 'Inter_400Regular',
            fontSize: 11,
            marginTop: 3,
        },
    });
}
