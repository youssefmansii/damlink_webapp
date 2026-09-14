'use client';

import { useEffect, useMemo, useRef } from 'react';
import type { GeoPoint } from '@/lib/geo';
import styles from './LiveRequestMap.module.css';

export interface MappedRequest {
  id: string;
  urgency?: string;
  hospitalName: string;
  hospitalPoint: GeoPoint | null;
  distanceKm?: number | null;
}

interface LiveRequestMapProps {
  requests: MappedRequest[];
  userLocation: GeoPoint | null;
  selectedRequestId?: string | null;
  compact?: boolean;
  onSelectRequest?: (request: MappedRequest) => void;
}

export default function LiveRequestMap({
  requests,
  userLocation,
  selectedRequestId,
  compact = false,
  onSelectRequest,
}: LiveRequestMapProps) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const leafletMapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);

  const visibleRequests = useMemo(
    () => requests.filter((request) => request.hospitalPoint),
    [requests]
  );

  useEffect(() => {
    let cancelled = false;

    async function renderMap() {
      if (!mapRef.current) return;
      const L = await import('leaflet');
      if (cancelled || !mapRef.current) return;

      if (!leafletMapRef.current) {
        leafletMapRef.current = L.map(mapRef.current, {
          zoomControl: !compact,
          attributionControl: !compact,
          scrollWheelZoom: !compact,
          dragging: true,
        });

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; OpenStreetMap contributors',
        }).addTo(leafletMapRef.current);
      }

      const map = leafletMapRef.current;
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];

      const bounds: Array<[number, number]> = [];

      if (userLocation) {
        bounds.push([userLocation.lat, userLocation.lng]);
        markersRef.current.push(
          L.marker([userLocation.lat, userLocation.lng], {
            icon: L.divIcon({
              className: '',
              html: `<div class="${styles.marker} ${styles.userMarker}">D</div>`,
              iconSize: [34, 34],
              iconAnchor: [17, 17],
            }),
            title: 'Your location',
          }).addTo(map)
        );
      }

      visibleRequests.forEach((request) => {
        const point = request.hospitalPoint!;
        const isSelected = selectedRequestId === request.id;
        const color = request.urgency === 'critical' ? '#DD1F2A' : '#E07B00';
        bounds.push([point.lat, point.lng]);

        const marker = L.marker([point.lat, point.lng], {
          icon: L.divIcon({
            className: '',
            html: `<div class="${styles.marker} ${isSelected ? styles.selectedMarker : ''}" style="background:${color}">H</div>`,
            iconSize: [34, 34],
            iconAnchor: [17, 17],
          }),
          title: request.hospitalName,
        }).addTo(map);

        marker.on('click', () => onSelectRequest?.(request));
        marker.bindPopup(
          `<strong>${escapeHtml(request.hospitalName)}</strong><br />${request.distanceKm == null ? '' : `${request.distanceKm.toFixed(1)} km away`}`
        );
        markersRef.current.push(marker);
      });

      if (bounds.length > 1) {
        map.fitBounds(bounds, { padding: compact ? [22, 22] : [34, 34], maxZoom: 15 });
      } else if (bounds.length === 1) {
        map.setView(bounds[0], 14);
      } else {
        map.setView([30.0444, 31.2357], 11);
      }

      setTimeout(() => map.invalidateSize(), 50);
    }

    renderMap();

    return () => {
      cancelled = true;
    };
  }, [visibleRequests, userLocation, selectedRequestId, compact, onSelectRequest]);

  useEffect(() => {
    return () => {
      leafletMapRef.current?.remove();
      leafletMapRef.current = null;
    };
  }, []);

  if (!userLocation && visibleRequests.length === 0) {
    return (
      <div className={styles.mapShell}>
        <div className={styles.emptyState}>Allow location access to see real nearby requests.</div>
      </div>
    );
  }

  return (
    <div className={styles.mapShell}>
      <div ref={mapRef} className={styles.mapCanvas} />
      <div className={styles.mapLabel}>
        {visibleRequests.length > 0
          ? `${visibleRequests.length} active request${visibleRequests.length === 1 ? '' : 's'}`
          : 'No mapped requests'}
      </div>
    </div>
  );
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return entities[char];
  });
}
