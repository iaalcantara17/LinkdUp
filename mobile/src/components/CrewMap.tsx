import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import MapView, { Marker, Circle } from 'react-native-maps';
import { colors } from '../theme';

export interface CrewMapProps {
    members: Array<{
        user_id: string;
        display_name: string;
        avatar_url?: string | null;
        avatar_color?: string | null;
        display_lat: number;
        display_lng: number;
    }>;
    midpoint?: { lat: number; lng: number } | null;
    radiusMeters?: number;
    height?: number;
    showMidpoint?: boolean;
    onMemberPress?: (userId: string) => void;
    scrollWheelZoom?: boolean;
}

export default function CrewMap({
    members,
    midpoint,
    radiusMeters = 10000,
    height = 260,
    showMidpoint = false,
    onMemberPress,
}: CrewMapProps) {
    const mapRef = useRef<MapView>(null);

    const allCoords = [
        ...members.map(m => ({ latitude: m.display_lat, longitude: m.display_lng })),
        ...(showMidpoint && midpoint ? [{ latitude: midpoint.lat, longitude: midpoint.lng }] : []),
    ];

    useEffect(() => {
        if (allCoords.length === 0) return;
        const timer = setTimeout(() => {
            mapRef.current?.fitToCoordinates(allCoords, {
                edgePadding: { top: 60, right: 60, bottom: 60, left: 60 },
                animated: true,
            });
        }, 350);
        return () => clearTimeout(timer);
    // coords change when members or midpoint visibility changes
    }, [members.length, showMidpoint]);

    if (members.length === 0) {
        return (
            <View style={[styles.empty, { height }]}>
                <Text style={styles.emptyText}>No location data yet</Text>
            </View>
        );
    }

    return (
        <MapView
            ref={mapRef}
            style={{ height, borderRadius: 16 }}
            userInterfaceStyle="dark"
            initialRegion={{
                latitude: members[0].display_lat,
                longitude: members[0].display_lng,
                latitudeDelta: 0.05,
                longitudeDelta: 0.05,
            }}
        >
            {members.map(m => (
                <Marker
                    key={m.user_id}
                    coordinate={{ latitude: m.display_lat, longitude: m.display_lng }}
                    onPress={() => onMemberPress?.(m.user_id)}
                >
                    <View style={[styles.avatarMarker, { backgroundColor: m.avatar_color ?? colors.primary }]}>
                        <Text style={styles.avatarInitial}>
                            {m.display_name.charAt(0).toUpperCase()}
                        </Text>
                    </View>
                </Marker>
            ))}

            {showMidpoint && midpoint && (
                <>
                    <Marker
                        coordinate={{ latitude: midpoint.lat, longitude: midpoint.lng }}
                        anchor={{ x: 0.5, y: 0.5 }}
                    >
                        <View style={styles.midpointMarker} />
                    </Marker>
                    <Circle
                        center={{ latitude: midpoint.lat, longitude: midpoint.lng }}
                        radius={radiusMeters}
                        strokeColor="rgba(108,62,244,0.6)"
                        fillColor="rgba(108,62,244,0.08)"
                        strokeWidth={2}
                    />
                </>
            )}
        </MapView>
    );
}

const styles = StyleSheet.create({
    empty: {
        borderRadius: 16,
        backgroundColor: colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
    },
    emptyText: { color: colors.text60, fontSize: 13, fontFamily: 'Inter_400Regular' },
    avatarMarker: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: 'white',
    },
    avatarInitial: { color: 'white', fontSize: 15, fontFamily: 'Inter_700Bold' },
    midpointMarker: {
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: colors.primary,
        borderWidth: 3,
        borderColor: 'white',
    },
});
