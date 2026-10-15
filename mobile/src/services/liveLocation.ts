import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import * as Location from 'expo-location';
import { readWebLocation, watchWebPermission, LiveResult, PermissionState } from './locationChoice';

const TIMEOUT_MS = 10_000;

export function useLocationPermission(): PermissionState {
    const [state, setState] = useState<PermissionState>('unknown');
    useEffect(() => {
        if (Platform.OS !== 'web' || typeof navigator === 'undefined') return;
        return watchWebPermission(navigator as any, setState);
    }, []);
    return state;
}

export async function getLiveLocation({ prompt }: { prompt: boolean }): Promise<LiveResult> {
    if (Platform.OS === 'web') {
        return readWebLocation(typeof navigator === 'undefined' ? undefined : (navigator as any), { prompt, timeoutMs: TIMEOUT_MS });
    }
    try {
        let perm = await Location.getForegroundPermissionsAsync();
        if (perm.status !== 'granted') {
            if (perm.status === 'denied' && !perm.canAskAgain) return { ok: false, reason: 'denied' };
            if (!prompt) return { ok: false, reason: 'prompt' };
            perm = await Location.requestForegroundPermissionsAsync();
            if (perm.status !== 'granted') return { ok: false, reason: 'denied' };
        }
        const recent = await Location.getLastKnownPositionAsync({ maxAge: 120_000 }).catch(() => null);
        if (recent) return { ok: true, coords: { latitude: recent.coords.latitude, longitude: recent.coords.longitude } };
        const pos = await Promise.race([
            Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), TIMEOUT_MS + 1000)),
        ]);
        if (!pos) return { ok: false, reason: 'timeout' };
        return { ok: true, coords: { latitude: pos.coords.latitude, longitude: pos.coords.longitude } };
    } catch {
        return { ok: false, reason: 'unavailable' };
    }
}
