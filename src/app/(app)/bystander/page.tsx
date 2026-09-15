'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { ArrowRightLeft, User, CreditCard, Car, ChevronRight, AlertCircle } from 'lucide-react';
import styles from './bystander.module.css';

type ScanMode = 'face' | 'national_id' | 'drivers_license';

interface ScanOption {
  mode: ScanMode;
  icon: any;
  label: string;
  description: string;
}

const SCAN_OPTIONS: ScanOption[] = [
  {
    mode: 'face',
    icon: User,
    label: 'Face Scan',
    description: 'Match victim via facial recognition (AWS Rekognition)',
  },
  {
    mode: 'national_id',
    icon: CreditCard,
    label: 'National ID',
    description: 'Scan Egyptian National ID card (OCR)',
  },
  {
    mode: 'drivers_license',
    icon: Car,
    label: "Driver's License",
    description: "Scan driver's license document (OCR)",
  },
];

export default function BystanderHomeScreen() {
  const router = useRouter();
  const [userName, setUserName] = useState('guest');
  const [isGuest, setIsGuest] = useState(true);

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    const forceGuest = localStorage.getItem('damlink_mode') === 'bystander_guest';
    if (forceGuest) {
      setUserName('guest');
      setIsGuest(true);
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setUserName('guest');
      setIsGuest(true);
      return;
    }

    setIsGuest(false);
    const { data: p } = await supabase.from('patients').select('full_name').eq('profile_id', user.id).maybeSingle();
    if (p?.full_name) {
      setUserName(p.full_name.split(' ')[0].toLowerCase());
    } else if (user.email) {
      setUserName(user.email.split('@')[0]);
    }
  };

  const launchScan = (mode: ScanMode) => {
    router.push(`/bystander/scan?mode=${mode}`);
  };

  const handleSwitchMode = () => {
    router.push(isGuest ? '/' : '/donor');
  };

  return (
    <div className={styles.screen}>
      {/* Header gradient */}
      <div className={styles.header}>
        <div className={styles.headerRow}>
          <div>
            <h1 className={styles.headerTitle}>🚨 Bystander Mode</h1>
            <p className={styles.headerSub}>Hello, {userName}</p>
          </div>
          <button className={styles.switchModeBtn} onClick={handleSwitchMode}>
            <ArrowRightLeft size={16} color="#FFFFFF" />
            {isGuest ? 'Sign in' : 'Donor'}
          </button>
        </div>

        {/* Hero CTA */}
        <div className={styles.heroCard}>
          <div className={styles.exclamationCircle}>
            <AlertCircle size={28} color="#FFFFFF" />
          </div>
          <h2 className={styles.heroTitle}>Found an injured person?</h2>
          <p className={styles.heroSub}>
            Scan their face or ID to identify them and instantly alert family & hospital.
          </p>
        </div>
      </div>

      {/* Scan options */}
      <h2 className={styles.sectionTitle}>Choose Scan Method</h2>

      {SCAN_OPTIONS.map((opt) => {
        const Icon = opt.icon;
        return (
          <div
            key={opt.mode}
            className={styles.scanCard}
            onClick={() => launchScan(opt.mode)}
          >
            <div className={styles.scanIconWrap}>
              <Icon size={26} color="#DD1F2A" />
            </div>
            <div className={styles.scanTextWrap}>
              <div className={styles.scanLabel}>{opt.label}</div>
              <div className={styles.scanDesc}>{opt.description}</div>
            </div>
            <ChevronRight size={20} color="#7A8499" />
          </div>
        );
      })}
    </div>
  );
}
