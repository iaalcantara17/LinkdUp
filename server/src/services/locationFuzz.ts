export function fuzzCoords(lat: number, lng: number, userId: string): { lat: number; lng: number } {
    const seed = hashString(userId);
    const latOffset = ((seed % 1000) / 1000 - 0.5) * 0.0144;
    const lngOffset = (((seed >> 10) % 1000) / 1000 - 0.5) * 0.018;
    return { lat: lat + latOffset, lng: lng + lngOffset };
}

function hashString(s: string): number {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
        h = ((h << 5) - h) + s.charCodeAt(i);
        h |= 0;
    }
    return Math.abs(h);
}
