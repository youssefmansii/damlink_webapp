'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { MapPin, Navigation, Loader2, Hospital, Droplet, Clock, CheckCircle2, ChevronRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import LiveRequestMap from '@/components/LiveRequestMap';
import { formatDistance, getBrowserLocation, haversineKm, parseGeoPoint, type GeoPoint } from '@/lib/geo';
import styles from './map.module.css';

const DONOR_CAN_GIVE_TO: Record<string, string[]> = {
  'O-':  ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'],
  'O+':  ['O+', 'A+', 'B+', 'AB+'],
  'A-':  ['A-', 'A+', 'AB-', 'AB+'],
  'A+':  ['A+', 'AB+'],
  'B-':  ['B-', 'B+', 'AB-', 'AB+'],
  'B+':  ['B+', 'AB+'],
  'AB-': ['AB-', 'AB+'],
  'AB+': ['AB+'],
};

const HIDDEN_DONOR_DISPATCH_STATUSES = new Set(['completed', 'declined', 'no_show']);

export default function MapScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [activeRequests, setActiveRequests] = useState<any[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<any | null>(null);
  const [donorBloodType, setDonorBloodType] = useState('A-');
  const [donorLocation, setDonorLocation] = useState<GeoPoint | null>(null);

  useEffect(() => {
    fetchActiveRequests();

    const channel = supabase
      .channel('map_emergency_requests')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'emergency_requests' }, () => {
        fetchActiveRequests();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchActiveRequests = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      let userBloodType = 'A-';
      let currentLocation: GeoPoint | null = null;
      let userId: string | null = null;

      if (user) {
        userId = user.id;
        const { data: p } = await supabase.from('profiles').select('blood_type').eq('id', user.id).maybeSingle();
        if (p?.blood_type) userBloodType = p.blood_type;

        const { data: donor } = await supabase
          .from('donor_profiles')
          .select('location')
          .eq('user_id', user.id)
          .maybeSingle();
        currentLocation = parseGeoPoint(donor?.location);
      }

      currentLocation = currentLocation ?? await getBrowserLocation();
      setDonorBloodType(userBloodType);
      setDonorLocation(currentLocation);

      const compatibleTypes = DONOR_CAN_GIVE_TO[userBloodType] || ['A-', 'A+', 'AB-', 'AB+'];

      // Query active & compatible emergency requests
      const { data, error } = await supabase
        .from('emergency_requests')
        .select('*, hospitals(name, address, phone, location)')
        .in('status', ['pending', 'hospital_notified', 'donor_matching'])
        .in('blood_type_needed', compatibleTypes);

      let finalRequests: any[] = [];

      if (!error && data && data.length > 0) {
        let dispatchStatusByRequest = new Map<string, string>();

        if (userId) {
          const requestIds = data.map((request) => request.id);
          const { data: donorDispatches } = await supabase
            .from('donor_dispatches')
            .select('request_id, status')
            .eq('donor_user_id', userId)
            .in('request_id', requestIds);

          dispatchStatusByRequest = new Map(
            (donorDispatches ?? []).map((dispatch) => [dispatch.request_id, dispatch.status])
          );
        }

        finalRequests = data.filter((request) => {
          const donorStatus = dispatchStatusByRequest.get(request.id);
          return !donorStatus || !HIDDEN_DONOR_DISPATCH_STATUSES.has(donorStatus);
        }).map((request) => {
          const hospitalPoint = parseGeoPoint(request.hospitals?.location);
          return {
            ...request,
            donorDispatchStatus: dispatchStatusByRequest.get(request.id) ?? null,
            hospitalPoint,
            distanceKm: currentLocation && hospitalPoint ? haversineKm(currentLocation, hospitalPoint) : null,
          };
        });
      }

      // Sort exact match first, then nearest real hospital.
      finalRequests.sort((a, b) => {
        const aExact = a.blood_type_needed === userBloodType ? 0 : 1;
        const bExact = b.blood_type_needed === userBloodType ? 0 : 1;
        if (aExact !== bExact) return aExact - bExact;
        const aDistance = a.distanceKm ?? Number.POSITIVE_INFINITY;
        const bDistance = b.distanceKm ?? Number.POSITIVE_INFINITY;
        if (aDistance !== bDistance) return aDistance - bDistance;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });

      const nearbyRequests = finalRequests.slice(0, 3);

      setActiveRequests(nearbyRequests);
      setSelectedRequest(nearbyRequests[0]);

    } catch (err) {
      console.error('[Map] Fetch active requests error:', err);
    } finally {
      setLoading(false);
    }
  };

  const getUrgencyColor = (urgency?: string) => {
    switch (urgency) {
      case 'critical': return '#DD1F2A';
      case 'urgent': return '#E07B00';
      default: return '#1EA35A';
    }
  };

  return (
    <div className={styles.screen}>
      <div className={styles.header}>
        <h1 className={styles.title}>Live Emergency Map</h1>
        <p className={styles.subtitle}>
          {activeRequests.length} nearby active request{activeRequests.length === 1 ? '' : 's'} compatible with your donor type ({donorBloodType})
        </p>
      </div>

      {loading ? (
        <div className={styles.loadingCard}>
          <Loader2 size={36} color="var(--donor-primary-bright)" className="animate-spin" />
        </div>
      ) : (
        <>
          <div className={styles.mapPlaceholder}>
            <LiveRequestMap
              userLocation={donorLocation}
              selectedRequestId={selectedRequest?.id}
              onSelectRequest={(mapped) => {
                const selected = activeRequests.find((request) => request.id === mapped.id);
                if (selected) setSelectedRequest(selected);
              }}
              requests={activeRequests.map((request) => ({
                id: request.id,
                urgency: request.urgency,
                hospitalName: request.hospitals?.name ?? 'Hospital',
                hospitalPoint: request.hospitalPoint ?? null,
                distanceKm: request.distanceKm ?? null,
              }))}
            />
          </div>

          {/* Legend */}
          <div className={styles.legend}>
            <div className={styles.legendItem}>
              <div className={styles.legendDot} style={{ backgroundColor: '#DD1F2A' }} />
              <span>Critical</span>
            </div>
            <div className={styles.legendItem}>
              <div className={styles.legendDot} style={{ backgroundColor: '#E07B00' }} />
              <span>Urgent</span>
            </div>
            <div className={styles.legendItem}>
              <div className={styles.legendDot} style={{ backgroundColor: '#2E5BFF' }} />
              <span>Your Location</span>
            </div>
          </div>

          {/* List of All Active Emergency Request Cards — Click to respond */}
          <div className={styles.cardsList}>
            <div className={styles.listTitle}>
              Active Nearby Dispatches ({activeRequests.length})
            </div>

            {activeRequests.length === 0 ? (
              <div className={styles.emptyMapCard}>
                <CheckCircle2 size={32} color="var(--donor-success)" />
                <span>No active compatible requests right now.</span>
              </div>
            ) : (
              activeRequests.map((req) => {
                const isSelected = selectedRequest?.id === req.id;
                const hospitalName = req.hospitals?.name || 'Hospital';
                const urgencyColor = getUrgencyColor(req.urgency);

                return (
                  <div
                    key={req.id}
                    className={`${styles.detailCard} ${isSelected ? styles.selectedDetailCard : ''}`}
                    onClick={() => router.push(`/request/${req.id}`)}
                  >
                    <div className={styles.detailHeader}>
                      <Hospital size={20} color="var(--donor-primary-bright)" />
                      <h3 className={styles.detailHospital}>{hospitalName}</h3>
                      <span
                        className={styles.urgencyBadge}
                        style={{ backgroundColor: urgencyColor }}
                      >
                        {(req.urgency || 'urgent').toUpperCase()}
                      </span>
                    </div>

                    <div className={styles.detailRow}>
                      <div className={styles.detailBadge}>
                        <Droplet size={14} color="#DD1F2A" />
                        <span>Type {req.blood_type_needed || donorBloodType}</span>
                      </div>
                      <div className={styles.detailBadge}>
                        <span>{req.units_needed || 1} Unit{req.units_needed > 1 ? 's' : ''} Needed</span>
                      </div>
                      <div className={styles.detailBadge}>
                        <Clock size={14} color="var(--donor-muted)" />
                        <span>Tap to Apply &amp; Respond</span>
                        <ChevronRight size={14} color="var(--donor-primary-bright)" />
                      </div>
                    </div>

                    {req.hospitals?.address && (
                      <div className={styles.addressLine}>
                        <MapPin size={14} color="var(--donor-muted)" />
                        <span>{formatDistance(req.distanceKm)} • {req.hospitals.address}</span>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
}
