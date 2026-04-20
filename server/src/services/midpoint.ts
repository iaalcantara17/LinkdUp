// Geographic midpoint calculation.
// For multiple points on a sphere, we convert to Cartesian, average, and convert back.
// Reference: http://www.geomidpoint.com/calculation.html

export interface LatLng {
    latitude: number;
    longitude: number;
}

const EARTH_RADIUS_KM = 6371;
const DEG = Math.PI / 180;

export function midpoint(points: LatLng[]): LatLng {
    if (points.length === 0) {
        throw new Error('cannot compute midpoint of empty point set');
    }
    if (points.length === 1) return { ...points[0] };

    let x = 0;
    let y = 0;
    let z = 0;

    for (const p of points) {
        const lat = p.latitude * DEG;
        const lng = p.longitude * DEG;
        x += Math.cos(lat) * Math.cos(lng);
        y += Math.cos(lat) * Math.sin(lng);
        z += Math.sin(lat);
    }

    const n = points.length;
    x /= n;
    y /= n;
    z /= n;

    const hyp = Math.sqrt(x * x + y * y);
    const lat = Math.atan2(z, hyp);
    const lng = Math.atan2(y, x);

    return { latitude: lat / DEG, longitude: lng / DEG };
}

// Haversine distance in kilometers
export function distanceKm(a: LatLng, b: LatLng): number {
    const dLat = (b.latitude - a.latitude) * DEG;
    const dLng = (b.longitude - a.longitude) * DEG;
    const lat1 = a.latitude * DEG;
    const lat2 = b.latitude * DEG;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

// Returns the maximum pairwise distance in km, used for the spread warning
export function maxSpreadKm(points: LatLng[]): number {
    let max = 0;
    for (let i = 0; i < points.length; i++) {
        for (let j = i + 1; j < points.length; j++) {
            const d = distanceKm(points[i], points[j]);
            if (d > max) max = d;
        }
    }
    return max;
}

export function distanceMiles(a: LatLng, b: LatLng): number {
    return distanceKm(a, b) * 0.621371;
}
