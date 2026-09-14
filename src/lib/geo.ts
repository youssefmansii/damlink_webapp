export interface GeoPoint {
  lat: number;
  lng: number;
}

export function parseGeoPoint(value: unknown): GeoPoint | null {
  if (!value) return null;

  if (typeof value === 'object') {
    const geo = value as { type?: string; coordinates?: unknown };
    if (geo.type === 'Point' && Array.isArray(geo.coordinates) && geo.coordinates.length >= 2) {
      return toPoint(Number(geo.coordinates[1]), Number(geo.coordinates[0]));
    }
  }

  if (typeof value !== 'string') return null;

  const wktMatch = value.match(/POINT\s*\(\s*([-0-9.]+)\s+([-0-9.]+)\s*\)/i);
  if (wktMatch) {
    return toPoint(Number(wktMatch[2]), Number(wktMatch[1]));
  }

  if (/^01010000/i.test(value) && value.length >= 42) {
    const bytes = value
      .slice(-32)
      .match(/../g)
      ?.map((hex) => parseInt(hex, 16));

    if (bytes?.length === 16) {
      const view = new DataView(new Uint8Array(bytes).buffer);
      return toPoint(view.getFloat64(8, true), view.getFloat64(0, true));
    }
  }

  return null;
}

export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const toRad = (degrees: number) => degrees * Math.PI / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const value =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

export function formatDistance(distanceKm: number | null | undefined): string {
  if (distanceKm == null || !Number.isFinite(distanceKm)) return 'Distance unavailable';
  if (distanceKm < 1) return `${Math.round(distanceKm * 1000)} m`;
  return `${distanceKm.toFixed(distanceKm < 10 ? 1 : 0)} km`;
}

export function getBrowserLocation(): Promise<GeoPoint | null> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve(null);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
    );
  });
}

function toPoint(lat: number, lng: number): GeoPoint | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}
