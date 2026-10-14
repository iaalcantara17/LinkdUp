import { createHmac } from 'node:crypto';
import { config } from '../config';

export function fuzzCoords(lat: number, lng: number, userId: string): { lat: number; lng: number } {
    const seed = createHmac('sha256', config.supabase.serviceRoleKey).update(`fuzz:${userId}`).digest().readUInt32BE(0);
    const latOffset = ((seed % 1000) / 1000 - 0.5) * 0.0144;
    const lngOffset = (((seed >>> 10) % 1000) / 1000 - 0.5) * 0.018;
    return { lat: lat + latOffset, lng: lng + lngOffset };
}
