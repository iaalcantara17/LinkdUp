import React, { useEffect } from 'react';
import { View, Text } from 'react-native';
import { MapContainer, TileLayer, Marker, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { colors } from '../theme';
import type { CrewMapProps } from './CrewMap';

export type { CrewMapProps };

function injectLeafletOverrides() {
    if (typeof document === 'undefined') return;
    if (document.getElementById('leaflet-overrides')) return;
    const style = document.createElement('style');
    style.id = 'leaflet-overrides';
    style.textContent = `
        .leaflet-container { background: #0A0A0F !important; }
        @keyframes linkdup-pin-drop {
            from { transform: translateY(-20px) scale(0.4); opacity: 0; }
            to   { transform: translateY(0)    scale(1);   opacity: 1; }
        }
    `;
    document.head.appendChild(style);
}

function BoundsUpdater({ coords }: { coords: [number, number][] }) {
    const map = useMap();
    const key = coords.map(c => c.join(',')).join('|');
    useEffect(() => {
        if (coords.length === 0) return;
        if (coords.length === 1) {
            map.setView(coords[0], 14, { animate: true });
            return;
        }
        map.fitBounds(L.latLngBounds(coords), { padding: [48, 48], animate: true });
    }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
    return null;
}

function memberIcon(name: string, color: string | null | undefined, avatarUrl: string | null | undefined) {
    const bg = color ?? '#6C3EF4';
    const initial = name.charAt(0).toUpperCase();
    const inner = avatarUrl
        ? `<img src="${avatarUrl}" style="width:100%;height:100%;object-fit:cover;" />`
        : `<span style="font-family:system-ui,sans-serif;font-size:15px;font-weight:700;color:#fff;">${initial}</span>`;
    return L.divIcon({
        className: '',
        html: `<div style="width:38px;height:38px;border-radius:50%;background:${bg};display:flex;align-items:center;justify-content:center;border:2.5px solid #fff;box-shadow:0 2px 10px rgba(0,0,0,0.6);overflow:hidden;box-sizing:border-box;">${inner}</div>`,
        iconSize: [38, 38],
        iconAnchor: [19, 19],
    });
}

function midpointIcon() {
    return L.divIcon({
        className: '',
        html: `<div style="display:flex;flex-direction:column;align-items:center;">
            <div style="width:22px;height:22px;border-radius:50%;background:linear-gradient(135deg,#6C3EF4,#00C2FF);border:3px solid #fff;box-shadow:0 0 20px rgba(108,62,244,0.8);animation:linkdup-pin-drop 0.6s cubic-bezier(0.22,0.61,0.36,1);"></div>
            <div style="width:3px;height:12px;background:rgba(255,255,255,0.7);"></div>
        </div>`,
        iconSize: [22, 34],
        iconAnchor: [11, 34],
    });
}

export default function CrewMap({
    members,
    midpoint,
    radiusMeters = 10000,
    height = 260,
    showMidpoint = false,
    onMemberPress,
    scrollWheelZoom = false,
}: CrewMapProps) {
    useEffect(() => { injectLeafletOverrides(); }, []);

    const allCoords: [number, number][] = [
        ...members.map(m => [m.display_lat, m.display_lng] as [number, number]),
        ...(showMidpoint && midpoint ? [[midpoint.lat, midpoint.lng] as [number, number]] : []),
    ];

    if (members.length === 0) {
        return (
            <View style={{ height, borderRadius: 16, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: colors.text60, fontSize: 13, fontFamily: 'Inter_400Regular' }}>
                    No location data yet
                </Text>
            </View>
        );
    }

    const initialCenter: [number, number] = [members[0].display_lat, members[0].display_lng];

    return (
        <div style={{ height, width: '100%', borderRadius: 16, overflow: 'hidden' }}>
            <MapContainer
                center={initialCenter}
                zoom={12}
                style={{ height: '100%', width: '100%' }}
                scrollWheelZoom={scrollWheelZoom}
                zoomControl={false}
            >
                <TileLayer
                    url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                />
                <BoundsUpdater coords={allCoords} />
                {members.map(m => (
                    <Marker
                        key={m.user_id}
                        position={[m.display_lat, m.display_lng]}
                        icon={memberIcon(m.display_name, m.avatar_color, m.avatar_url)}
                        eventHandlers={{ click: () => onMemberPress?.(m.user_id) }}
                    />
                ))}
                {showMidpoint && midpoint && (
                    <>
                        <Marker
                            position={[midpoint.lat, midpoint.lng]}
                            icon={midpointIcon()}
                        />
                        <Circle
                            center={[midpoint.lat, midpoint.lng]}
                            radius={radiusMeters}
                            pathOptions={{
                                color: '#6C3EF4',
                                fillColor: '#6C3EF4',
                                fillOpacity: 0.08,
                                weight: 2,
                                opacity: 0.5,
                            }}
                        />
                    </>
                )}
            </MapContainer>
        </div>
    );
}
