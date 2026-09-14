'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { AlertCircle, ArrowLeft, Bell, HeartPulse, Loader2, MapPin } from 'lucide-react';
import styles from './nfc.module.css';

type PatientPreview = {
  id: string;
  full_name: string;
  age: number | null;
  blood_type: string;
  photo_url?: string | null;
};

type HospitalPreview = {
  id: string;
  name: string;
  address?: string | null;
  eta_minutes?: number | null;
};

function NfcEmergencyContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = (searchParams.get('card') || searchParams.get('token') || '').trim();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [patient, setPatient] = useState<PatientPreview | null>(null);
  const [hospital, setHospital] = useState<HospitalPreview | null>(null);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    previewCard();
  }, [token]);

  const getCoordinates = (): Promise<{ lat: number; lng: number }> => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve({ lat: 30.0444, lng: 31.2357 });
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve({ lat: 30.0444, lng: 31.2357 }),
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
      );
    });
  };

  const getPhotoSrc = (url?: string | null) => {
    if (!url) return null;
    if (url.startsWith('data:') || url.startsWith('http://') || url.startsWith('https://')) return url;
    const cleanPath = url.replace(/^bystander\//, '');
    return supabase.storage.from('scan-uploads').getPublicUrl(cleanPath).data.publicUrl;
  };

  const previewCard = async () => {
    if (!token) {
      setLoading(false);
      setError('This NFC card link is missing its emergency token.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const coords = await getCoordinates();
      const { data, error: fnError } = await supabase.functions.invoke('on-victim-scan', {
        body: {
          scan_mode: 'nfc',
          nfc_token: token,
          preview_only: true,
          bystander_lat: coords.lat,
          bystander_lng: coords.lng,
        },
      });

      if (fnError) throw fnError;
      if (!data?.matched || !data?.patient) {
        setError('This NFC card is not active or is not linked to a patient.');
        return;
      }

      setPatient(data.patient);
      setHospital(data.hospital ?? null);
    } catch (err) {
      console.error('[NFC] Preview error:', err);
      setError('Could not read this DamLink NFC card right now.');
    } finally {
      setLoading(false);
    }
  };

  const handleNotify = async () => {
    if (!token || !patient) return;

    setSubmitting(true);
    setError('');

    try {
      const coords = await getCoordinates();
      const { data, error: fnError } = await supabase.functions.invoke('on-victim-scan', {
        body: {
          scan_mode: 'nfc',
          nfc_token: token,
          description: notes.trim() || 'Emergency started from DamLink NFC card.',
          bystander_lat: coords.lat,
          bystander_lng: coords.lng,
        },
      });

      if (fnError) throw fnError;
      if (!data?.matched || !data?.patient || !data?.request_id) {
        throw new Error('Emergency request was not created.');
      }

      sessionStorage.setItem(
        'damlink_match_data',
        JSON.stringify({
          matched: true,
          patient: data.patient,
          request_id: data.request_id,
          hospital: data.hospital ?? null,
          scan_mode: 'nfc',
          scanned_image: null,
        })
      );

      router.push('/bystander/match-result');
    } catch (err) {
      console.error('[NFC] Notify error:', err);
      setError('Could not send the NFC emergency alert. Please call ambulance services and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const photoSrc = getPhotoSrc(patient?.photo_url);
  const initials = patient?.full_name
    ? patient.full_name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()
    : 'DL';

  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        <button className={styles.backButton} onClick={() => router.push('/bystander')} aria-label="Back to bystander">
          <ArrowLeft size={22} color="#FFFFFF" />
        </button>
        <div>
          <h1>DamLink NFC Emergency</h1>
          <p>Confirm the patient before sending alerts</p>
        </div>
      </header>

      <main className={styles.content}>
        {loading ? (
          <section className={styles.loadingCard}>
            <Loader2 size={34} className="animate-spin" />
            <span>Reading emergency card...</span>
          </section>
        ) : error && !patient ? (
          <section className={styles.errorCard}>
            <AlertCircle size={36} />
            <h2>Card Not Available</h2>
            <p>{error}</p>
            <button type="button" onClick={previewCard}>Try Again</button>
          </section>
        ) : patient ? (
          <>
            {error && (
              <div className={styles.inlineError} role="alert">
                <AlertCircle size={18} />
                <span>{error}</span>
              </div>
            )}

            <section className={styles.patientCard}>
              {photoSrc ? (
                <img src={photoSrc} alt={patient.full_name} className={styles.patientPhoto} />
              ) : (
                <div className={styles.patientInitials}>{initials}</div>
              )}
              <div className={styles.patientInfo}>
                <span className={styles.identityLabel}>Linked Patient</span>
                <h2>{patient.full_name}</h2>
                <div className={styles.patientMeta}>
                  <span>{patient.age ? `${patient.age} years` : 'Age unknown'}</span>
                  <strong>{patient.blood_type || 'Unknown'}</strong>
                </div>
              </div>
            </section>

            <section className={styles.hospitalCard}>
              <div className={styles.hospitalIcon}>
                <MapPin size={20} color="#FFFFFF" />
              </div>
              <div>
                <span>Nearest hospital</span>
                <strong>{hospital?.name || 'Hospital assignment pending'}</strong>
                {hospital?.address && <p>{hospital.address}</p>}
              </div>
            </section>

            <section className={styles.notesCard}>
              <label htmlFor="nfc-notes">Accident notes</label>
              <textarea
                id="nfc-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Example: unconscious, bleeding, road accident..."
                rows={4}
              />
            </section>

            <button className={styles.notifyButton} onClick={handleNotify} disabled={submitting}>
              {submitting ? (
                <Loader2 size={22} className="animate-spin" />
              ) : (
                <>
                  <Bell size={22} />
                  <span>Notify Hospital & Emergency Contacts</span>
                </>
              )}
            </button>

            <a className={styles.callButton} href="tel:123">
              <HeartPulse size={19} />
              <span>Call Ambulance 123</span>
            </a>

            <p className={styles.privacyNote}>
              This card only contains a secure DamLink token. Medical alerts are sent after you confirm.
            </p>
          </>
        ) : null}
      </main>
    </div>
  );
}

export default function NfcEmergencyPage() {
  return (
    <Suspense fallback={<div className={styles.screen}>Loading NFC card...</div>}>
      <NfcEmergencyContent />
    </Suspense>
  );
}
