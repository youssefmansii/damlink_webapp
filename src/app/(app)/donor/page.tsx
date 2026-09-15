'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Droplet, Calendar, CheckCircle2, Map, ChevronRight, MapPin, ArrowRightLeft, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import LiveRequestMap from '@/components/LiveRequestMap';
import { formatDistance, getBrowserLocation, getRouteDistance, parseGeoPoint, type GeoPoint } from '@/lib/geo';
import styles from './donor.module.css';

// Blood compatibility matrix (Key = Donor Blood Type -> Value = Recipient Blood Types donor CAN give to)
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

const ACTIVE_DONOR_REQUEST_STATUSES = ['donor_matching', 'donor_dispatched'];
const NEARBY_RADIUS_KM = 25;
const DONATION_COOLDOWN_DAYS = 90;

function getDonationCooldownUntil(donorProfile: any): Date | null {
  const lastDonationDate = donorProfile?.last_donation_date || donorProfile?.donor_last_donation_date;
  if (!lastDonationDate) return null;

  const cooldownUntil = new Date(lastDonationDate);
  cooldownUntil.setDate(cooldownUntil.getDate() + DONATION_COOLDOWN_DAYS);

  return cooldownUntil > new Date() ? cooldownUntil : null;
}

export default function DonorDashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [donorProfile, setDonorProfile] = useState<any>(null);
  const [requests, setRequests] = useState<any[]>([]);
  const [isActive, setIsActive] = useState(true);
  const [donorLocation, setDonorLocation] = useState<GeoPoint | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState<Date | null>(null);

  useEffect(() => {
    fetchData();

    const channel = supabase
      .channel('emergency_requests_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'emergency_requests' }, () => {
        fetchData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    // 1. Fetch Profile & Donor Profile
    const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
    const { data: d } = await supabase.from('donor_profiles').select('*').eq('user_id', user.id).maybeSingle();

    const userProfile = p || { full_name: user.email?.split('@')[0] || 'Donor', blood_type: 'A-' };
    const userDonor = d || { donations_count: 0, lives_saved_estimate: 0, is_active: false };
    const currentLocation = parseGeoPoint(userDonor?.location) ?? await getBrowserLocation();

    setProfile(userProfile);
    setDonorProfile(userDonor);
    setIsActive(userDonor?.is_active ?? true);
    setDonorLocation(currentLocation);
    const activeCooldownUntil = getDonationCooldownUntil(userDonor);
    setCooldownUntil(activeCooldownUntil);

    // 2. Fetch nearby compatible requests that are ready for donors.
    const donorBloodType = userProfile.blood_type || 'A-';
    const compatibleTypes = DONOR_CAN_GIVE_TO[donorBloodType] || ['A-', 'A+', 'AB-', 'AB+'];

    const { data: requestRows, error: requestErr } = await supabase
      .from('emergency_requests')
      .select(`
        *,
        hospitals(name, address, phone, location)
      `)
      .in('status', ACTIVE_DONOR_REQUEST_STATUSES)
      .in('blood_type_needed', compatibleTypes);

    let finalRequests: any[] = [];

    if (!requestErr && requestRows && requestRows.length > 0 && userDonor?.is_active !== false && !activeCooldownUntil) {
      finalRequests = await Promise.all(requestRows
        .map(async (request: any) => {
          const hospitalPoint = parseGeoPoint(request.hospitals?.location);
          const route = currentLocation && hospitalPoint ? await getRouteDistance(currentLocation, hospitalPoint) : null;
          return {
            ...request,
            hospitalPoint,
            distanceKm: route?.distanceKm ?? null,
            etaMinutes: route?.etaMinutes ?? null,
            distanceSource: route?.source ?? null,
          };
        }));

      finalRequests = finalRequests
        .filter((request: any) =>
          request.distanceKm == null || request.distanceKm <= NEARBY_RADIUS_KM
        );
    }

    // Sort exact blood type match first, then nearest real hospital.
    finalRequests.sort((a, b) => {
      const aExact = a.blood_type_needed === donorBloodType ? 0 : 1;
      const bExact = b.blood_type_needed === donorBloodType ? 0 : 1;
      if (aExact !== bExact) return aExact - bExact;
      const aDistance = a.distanceKm ?? Number.POSITIVE_INFINITY;
      const bDistance = b.distanceKm ?? Number.POSITIVE_INFINITY;
      if (aDistance !== bDistance) return aDistance - bDistance;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    setRequests(finalRequests);
    setLoading(false);
  };

  const toggleActiveStatus = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    const newValue = !isActive;
    setIsActive(newValue);

    if (user) {
      await supabase.from('donor_profiles').update({ is_active: newValue }).eq('user_id', user.id);
    }
  };

  const getUrgencyColor = (urgency?: string) => {
    switch (urgency) {
      case 'critical': return '#DD1F2A';
      case 'urgent': return '#E07B00';
      default: return '#1EA35A';
    }
  };

  const initials = profile?.full_name
    ? profile.full_name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()
    : 'YM';

  if (loading) {
    return (
      <div className={styles.screen} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <Loader2 size={36} color="var(--donor-primary-bright)" className="animate-spin" />
      </div>
    );
  }

  const homeRequests = requests.slice(0, 2);
  const cooldownDate = cooldownUntil?.toLocaleDateString('en-EG', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  const emptyMessage = cooldownDate
    ? `You can donate again after ${cooldownDate}.`
    : isActive
      ? `No blood requests matching your donor type (${profile?.blood_type}) right now. New requests will appear here live.`
      : 'Turn on Active Donor when you are available to receive nearby requests.';

  return (
    <div className={styles.screen}>
      {/* Header Gradient */}
      <div className={styles.topSection}>
        <div className={styles.headerRow}>
          <h1 className={styles.headerTitle}>Donor Dashboard</h1>
          <button className={styles.switchModeBtn} onClick={() => router.push('/bystander')}>
            <ArrowRightLeft size={14} color="#FFFFFF" />
            Bystander
          </button>
        </div>

        {/* Profile Card */}
        <div className={styles.profileCard}>
          <div className={styles.profileLeft}>
            <div className={styles.avatar}>
              <span className={styles.avatarText}>{initials}</span>
            </div>
            <div>
              <div className={styles.name}>{profile?.full_name ?? 'youssef mansi'}</div>
              <div className={styles.activeRow}>
                <div className={`${styles.activeDot} ${isActive ? styles.activeDotActive : styles.activeDotInactive}`} />
                <span className={styles.activeText}>{isActive ? 'Active Donor' : 'Inactive'}</span>
              </div>
            </div>
          </div>
          <div className={styles.rightSide}>
            <div className={styles.bloodBadge}>
              <span className={styles.bloodText}>{profile?.blood_type ?? 'A-'}</span>
            </div>
            <div className={`${styles.toggleSwitch} ${isActive ? styles.active : ''}`} onClick={toggleActiveStatus}>
              <div className={styles.toggleThumb} />
            </div>
          </div>
        </div>
      </div>

      {/* Stats Card */}
      <div className={styles.statsCard}>
        <div className={styles.statItem}>
          <span className={styles.statValue}>{donorProfile?.donations_count ?? 0}</span>
          <span className={styles.statLabel}>Donations</span>
        </div>
        <div className={styles.statDivider} />
        <div className={styles.statItem}>
          <span className={styles.statValue}>{donorProfile?.lives_saved_estimate ?? 0}</span>
          <span className={styles.statLabel}>Lives Saved</span>
        </div>
        <div className={styles.statDivider} />
        <div className={styles.statItem}>
          <div className={styles.lastDonationLabel}>
            <Calendar size={14} color="var(--donor-primary-bright)" />
            <span className={styles.lastDonationText}>Recent</span>
          </div>
          <span className={styles.statLabel}>Last Donation</span>
        </div>
      </div>

      {/* Nearby Active Requests Section */}
      <h2 className={styles.sectionTitle}>
        Nearby Requests ({requests.length} Compatible for {profile?.blood_type ?? 'A-'})
      </h2>

      {requests.length === 0 ? (
        <div className={styles.emptyBox}>
          <CheckCircle2 size={32} color="var(--donor-success)" />
          <span className={styles.emptyTitle}>No compatible active requests</span>
          <span className={styles.emptySubtitle}>
            {emptyMessage}
          </span>
        </div>
      ) : (
        <>
          {/* Map Preview Card */}
          <div className={styles.mapCard} onClick={() => router.push('/map')}>
            <LiveRequestMap
              compact
              userLocation={donorLocation}
              requests={requests.map((request) => ({
                id: request.id,
                urgency: request.urgency,
                hospitalName: request.hospitals?.name ?? 'Hospital',
                hospitalPoint: request.hospitalPoint ?? null,
                distanceKm: request.distanceKm ?? null,
              }))}
            />
            <div className={styles.mapOverlay}>
              <Map size={14} color="#FFFFFF" />
              <span className={styles.mapOverlayText}>Tap to view all {requests.length} requests on map</span>
            </div>
          </div>

          {/* Top Urgent Requests — Tapping opens Request Details / Respond Screen */}
          <h2 className={styles.sectionTitle}>Urgent Requests</h2>
          <div className={styles.requestsCard}>
            {homeRequests.map((r, i) => {
              const hospitalName = r.hospitals?.name || 'Hospital';
              return (
                <div key={r.id || i} style={{ cursor: 'pointer' }} onClick={() => router.push(`/request/${r.id}`)}>
                  <div className={styles.requestRow}>
                    <div className={styles.hospitalAvatar} style={{ backgroundColor: getUrgencyColor(r.urgency) }}>
                      <span className={styles.hospitalAvatarText}>{hospitalName.charAt(0)}</span>
                    </div>
                    <div className={styles.requestInfo}>
                      <div className={styles.hospitalName}>{hospitalName}</div>
                      <div className={styles.metaLine}>
                        Blood Type: <span className={styles.metaStrong} style={{ color: getUrgencyColor(r.urgency) }}>{r.blood_type_needed || 'A-'}</span> • {r.units_needed || 1} Unit{r.units_needed > 1 ? 's' : ''} Needed
                      </div>
                      <div className={styles.urgencyLine} style={{ color: getUrgencyColor(r.urgency) }}>
                        ⚡ {(r.urgency || 'urgent').toUpperCase()} • Tap to Respond & Apply
                      </div>
                    </div>
                    <div className={styles.distanceBlock}>
                      <MapPin size={12} color="#7A8499" />
                      <span className={styles.distanceText}>{formatDistance(r.distanceKm)}</span>
                    </div>
                  </div>
                  {i < homeRequests.length - 1 && <div className={styles.requestDivider} />}
                </div>
              );
            })}
          </div>

          {/* View All Card */}
          <div className={styles.viewAllCard} onClick={() => router.push('/map')}>
            <div className={styles.viewAllIcon}>
              <Droplet size={18} color="#FFFFFF" />
            </div>
            <div className={styles.viewAllTextBlock}>
              <div className={styles.viewAllTitle}>View All {requests.length} Requests on Map</div>
              <div className={styles.viewAllSub}>See all nearby blood requests</div>
            </div>
            <ChevronRight size={20} color="var(--donor-primary-bright)" />
          </div>
        </>
      )}
    </div>
  );
}
