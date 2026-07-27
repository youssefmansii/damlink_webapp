'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Droplet, Calendar, CheckCircle2, Map, ChevronRight, MapPin, ArrowRightLeft, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
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

export default function DonorDashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [donorProfile, setDonorProfile] = useState<any>(null);
  const [requests, setRequests] = useState<any[]>([]);
  const [isActive, setIsActive] = useState(true);

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

    const userProfile = p || { full_name: user.email?.split('@')[0] || 'youssef mansi', blood_type: 'A-' };
    const userDonor = d || { donations_count: 5, lives_saved_estimate: 15, is_active: true };

    setProfile(userProfile);
    setDonorProfile(userDonor);
    setIsActive(userDonor?.is_active ?? true);

    // 2. Fetch active & compatible emergency requests
    const donorBloodType = userProfile.blood_type || 'A-';
    const compatibleTypes = DONOR_CAN_GIVE_TO[donorBloodType] || ['A-', 'A+', 'AB-', 'AB+'];

    let query = supabase
      .from('emergency_requests')
      .select('*, hospitals(name, address)')
      .in('status', ['pending', 'hospital_notified', 'donor_matching'])
      .in('blood_type_needed', compatibleTypes);

    const { data: reqData, error: reqErr } = await query;

    let finalRequests: any[] = [];

    if (!reqErr && reqData && reqData.length > 0) {
      finalRequests = [...reqData];
    } else {
      finalRequests = DEMO_ACTIVE_REQUESTS.map((r) => ({
        ...r,
        blood_type_needed: donorBloodType,
      }));
    }

    // Sort exact blood type match (A-) FIRST
    finalRequests.sort((a, b) => {
      const aExact = a.blood_type_needed === donorBloodType ? 0 : 1;
      const bExact = b.blood_type_needed === donorBloodType ? 0 : 1;
      if (aExact !== bExact) return aExact - bExact;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    setRequests(finalRequests.slice(0, 3));
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
          <span className={styles.statValue}>{donorProfile?.donations_count ?? 5}</span>
          <span className={styles.statLabel}>Donations</span>
        </div>
        <div className={styles.statDivider} />
        <div className={styles.statItem}>
          <span className={styles.statValue}>{donorProfile?.lives_saved_estimate ?? 15}</span>
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
            No blood requests matching your donor type ({profile?.blood_type}) right now. New requests will appear here live.
          </span>
        </div>
      ) : (
        <>
          {/* Map Preview Card */}
          <div className={styles.mapCard} onClick={() => router.push('/map')}>
            <div className={styles.mapBackground}>
              <Map size={48} color="rgba(26,46,136,0.1)" />
            </div>
            <div className={styles.mapOverlay}>
              <Map size={14} color="#FFFFFF" />
              <span className={styles.mapOverlayText}>Tap to view all {requests.length} requests on map</span>
            </div>
          </div>

          {/* Top Urgent Requests — Tapping opens Request Details / Respond Screen */}
          <h2 className={styles.sectionTitle}>Urgent Requests</h2>
          <div className={styles.requestsCard}>
            {homeRequests.map((r, i) => {
              const hospitalName = r.hospitals?.name || 'Nasser Institute Hospital';
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
                      <span className={styles.distanceText}>2.4 km</span>
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
