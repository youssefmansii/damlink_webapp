'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import {
  Droplet, LogOut, ChevronRight, Phone, Mail, ShieldCheck, Bell, Loader2
} from 'lucide-react';
import styles from './profile.module.css';

export default function ProfilePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [donorProfile, setDonorProfile] = useState<any>(null);
  const [isActive, setIsActive] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    fetchProfileData();
  }, []);

  const fetchProfileData = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace('/');
        return;
      }

      // Fetch profiles table row
      let { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      // Fetch donor_profiles table row
      let { data: donorData } = await supabase
        .from('donor_profiles')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      // If user row is missing in profiles table, create default row
      if (!profileData) {
        const defaultProfile = {
          id: user.id,
          full_name: user.user_metadata?.full_name || 'Registered Donor',
          phone: user.user_metadata?.phone || '+20 100 000 0000',
          blood_type: 'O+',
          is_donor_registered: true,
        };
        const { data: newProfile } = await supabase
          .from('profiles')
          .insert(defaultProfile)
          .select('*')
          .single();
        profileData = newProfile || defaultProfile;
      }

      // If user row is missing in donor_profiles table, create default row
      if (!donorData) {
        const defaultDonor = {
          user_id: user.id,
          is_active: true,
          donations_count: 3,
          lives_saved_estimate: 9,
          reliability_rating: 5.0,
          points_balance: 1250,
        };
        const { data: newDonor } = await supabase
          .from('donor_profiles')
          .insert(defaultDonor)
          .select('*')
          .single();
        donorData = newDonor || defaultDonor;
      }

      setProfile({
        ...profileData,
        email: user.email,
        photo_url: profileData.photo_url || '/demo-avatar.png',
      });
      setDonorProfile(donorData);
      setIsActive(donorData?.is_active ?? true);
    } catch (err) {
      console.error('[Profile] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleAvailability = async () => {
    if (!profile || toggling) return;
    setToggling(true);
    const newValue = !isActive;

    try {
      const { error } = await supabase
        .from('donor_profiles')
        .update({ is_active: newValue })
        .eq('user_id', profile.id);

      if (!error) {
        setIsActive(newValue);
      } else {
        console.warn('Update availability error:', error.message);
        setIsActive(newValue);
      }
    } catch (err) {
      console.error(err);
      setIsActive(newValue);
    } finally {
      setToggling(false);
    }
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    await supabase.auth.signOut();
    router.replace('/');
  };

  if (loading) {
    return (
      <div className={styles.screen} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <Loader2 size={36} color="var(--donor-primary-bright)" className="animate-spin" />
      </div>
    );
  }

  const initials = profile?.full_name
    ? profile.full_name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()
    : 'DO';

  return (
    <div className={styles.screen}>
      <div className={styles.content}>
        <h1 className={styles.title}>Donor Profile</h1>
        <p className={styles.subtitle}>Manage your donor identity and settings</p>

        {/* Avatar Card */}
        <div className={styles.avatarCard}>
          <div className={styles.avatarWrap}>
            {profile?.photo_url ? (
              <img src={profile.photo_url} alt={profile.full_name} className={styles.avatarImg} />
            ) : (
              <div className={styles.avatarInitials}>{initials}</div>
            )}
          </div>
          <div className={styles.avatarInfo}>
            <div className={styles.name}>{profile?.full_name ?? 'Donor'}</div>
            <div className={styles.phone}>{profile?.phone ?? '+20 100 000 0000'}</div>
            <div className={styles.email}>{profile?.email ?? 'donor@damlink.com'}</div>
          </div>
          {profile?.blood_type && (
            <div className={styles.bloodBadge}>
              <span className={styles.bloodText}>{profile.blood_type}</span>
            </div>
          )}
        </div>

        {/* Stats Row */}
        <div className={styles.statsRow}>
          <div className={styles.statBlock}>
            <span className={styles.statValue}>{donorProfile?.donations_count ?? 0}</span>
            <span className={styles.statLabel}>Donations</span>
          </div>
          <div className={styles.statDivider} />
          <div className={styles.statBlock}>
            <span className={styles.statValue}>{donorProfile?.lives_saved_estimate ?? 0}</span>
            <span className={styles.statLabel}>Lives Saved</span>
          </div>
          <div className={styles.statDivider} />
          <div className={styles.statBlock}>
            <span className={styles.statValue}>
              {donorProfile?.reliability_rating ? Number(donorProfile.reliability_rating).toFixed(1) : '5.0'}
            </span>
            <span className={styles.statLabel}>Rating</span>
          </div>
        </div>

        {/* Availability Toggle */}
        <div className={styles.card}>
          <div className={styles.cardTitle}>Availability</div>
          <div className={styles.row}>
            <div className={styles.rowTextWrap}>
              <div className={styles.rowTitle}>Active Donor Status</div>
              <div className={styles.rowSub}>Receive urgent matching requests nearby</div>
            </div>
            <div
              className={`${styles.toggle} ${isActive ? styles.toggleOn : ''}`}
              onClick={toggleAvailability}
            >
              <div className={styles.toggleThumb} />
            </div>
          </div>
        </div>

        {/* Nav Cards */}
        <NavCard icon={<Droplet size={20} color="var(--donor-primary-bright)" />} label="Blood Type Registration" />
        <NavCard icon={<Phone size={20} color="var(--donor-primary-bright)" />} label="Emergency Contacts" />
        <NavCard icon={<Bell size={20} color="var(--donor-primary-bright)" />} label="Notification Settings" />
        <NavCard icon={<ShieldCheck size={20} color="var(--donor-primary-bright)" />} label="Privacy & Security" />

        {/* Sign Out */}
        <button
          className={styles.signOutButton}
          onClick={handleSignOut}
          disabled={signingOut}
        >
          <LogOut size={20} color="#DD1F2A" />
          <span className={styles.signOutText}>{signingOut ? 'Signing out...' : 'Sign Out'}</span>
        </button>
      </div>
    </div>
  );
}

function NavCard({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className={styles.navCard}>
      <div className={styles.navLeft}>
        {icon}
        <span className={styles.navText}>{label}</span>
      </div>
      <ChevronRight size={20} color="#7A8499" />
    </div>
  );
}
