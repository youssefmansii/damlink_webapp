'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { MapPin, Navigation, Loader2, Hospital, Droplet, Clock, CheckCircle2, ChevronRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
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

// Standardized Synchronized Emergency Requests
const DEMO_ACTIVE_REQUESTS = [
  {
    id: 'req-nasser-1',
    blood_type_needed: 'A-',
    units_needed: 1,
    urgency: 'urgent',
    status: 'donor_matching',
    created_at: new Date().toISOString(),
    hospitals: { name: 'Nasser Institute Hospital', address: 'Corniche El Nile, Shubra, Cairo' },
  },
  {
    id: 'req-maadi-1',
    blood_type_needed: 'A-',
    units_needed: 3,
    urgency: 'critical',
    status: 'donor_matching',
    created_at: new Date(Date.now() - 3600000).toISOString(),
    hospitals: { name: 'Al-Maadi Military Hospital', address: 'Road 9, Maadi, Cairo' },
  },
  {
    id: 'req-kasr-1',
    blood_type_needed: 'A-',
    units_needed: 2,
    urgency: 'urgent',
    status: 'pending',
    created_at: new Date(Date.now() - 7200000).toISOString(),
    hospitals: { name: 'Kasr Al Ainy Hospital', address: 'El Manial, Cairo' },
  },
];

export default function MapScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [activeRequests, setActiveRequests] = useState<any[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<any | null>(null);
  const [donorBloodType, setDonorBloodType] = useState('A-');

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

      if (user) {
        const { data: p } = await supabase.from('profiles').select('blood_type').eq('id', user.id).maybeSingle();
        if (p?.blood_type) userBloodType = p.blood_type;
      }
      setDonorBloodType(userBloodType);

      const compatibleTypes = DONOR_CAN_GIVE_TO[userBloodType] || ['A-', 'A+', 'AB-', 'AB+'];

      // Query active & compatible emergency requests
      const { data, error } = await supabase
        .from('emergency_requests')
        .select('*, hospitals(name, address, phone)')
        .in('status', ['pending', 'hospital_notified', 'donor_matching'])
        .in('blood_type_needed', compatibleTypes);

      let finalRequests: any[] = [];

      if (!error && data && data.length > 0) {
        finalRequests = [...data];
      } else {
        finalRequests = DEMO_ACTIVE_REQUESTS.map((r) => ({
          ...r,
          blood_type_needed: userBloodType,
        }));
      }

      // Sort exact match (A-) to the TOP
      finalRequests.sort((a, b) => {
        const aExact = a.blood_type_needed === userBloodType ? 0 : 1;
        const bExact = b.blood_type_needed === userBloodType ? 0 : 1;
        if (aExact !== bExact) return aExact - bExact;
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
          {/* Map Display */}
          <div className={styles.mapPlaceholder}>
            <div className={styles.fakeMap}>
              {/* Active Pins */}
              {activeRequests.map((req, i) => {
                const isSelected = selectedRequest?.id === req.id;
                const topPos = i === 0 ? '30%' : i === 1 ? '45%' : '65%';
                const leftPos = i === 0 ? '35%' : i === 1 ? '60%' : '42%';
                const color = getUrgencyColor(req.urgency);

                return (
                  <div
                    key={req.id}
                    className={`${styles.pin} ${isSelected ? styles.selectedPin : ''}`}
                    style={{ top: topPos, left: leftPos, backgroundColor: color }}
                    onClick={() => setSelectedRequest(req)}
                    title={req.hospitals?.name}
                  >
                    <MapPin size={18} color="#FFFFFF" />
                  </div>
                );
              })}

              {/* User Location Pin */}
              <div className={`${styles.pin} ${styles.userPin}`} style={{ top: '48%', left: '46%' }}>
                <Navigation size={14} color="#FFFFFF" />
              </div>

              <div className={styles.mapLabel}>
                {activeRequests.length > 0 ? `● ${activeRequests.length} Active Nearby Requests` : 'No Active Dispatches'}
              </div>
            </div>
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
                const hospitalName = req.hospitals?.name || 'Nasser Institute Hospital';
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
                        <span>{req.hospitals.address}</span>
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
