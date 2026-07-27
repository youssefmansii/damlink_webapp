'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { ScanFace, CheckCircle, Loader2 } from 'lucide-react';
import styles from './scanning.module.css';

const STEPS = [
  'Uploading image securely…',
  'Running facial recognition (AWS Rekognition)…',
  'Matching against patient registry…',
  'Finding nearest hospital with matching blood inventory…',
];

function ScanningContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mode = searchParams.get('mode') || 'face';
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    runScanProcess();
  }, []);

  useEffect(() => {
    if (currentStep < STEPS.length - 1) {
      const t = setTimeout(() => setCurrentStep((s) => s + 1), 1000);
      return () => clearTimeout(t);
    }
  }, [currentStep]);

  const getCoordinates = (): Promise<{ lat: number; lng: number }> => {
    return new Promise((resolve) => {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
          () => resolve({ lat: 30.0444, lng: 31.2357 })
        );
      } else {
        resolve({ lat: 30.0444, lng: 31.2357 });
      }
    });
  };

  const runScanProcess = async () => {
    try {
      const imageUri = sessionStorage.getItem('damlink_scan_image');
      const coords = await getCoordinates();
      let imageRef = `bystander/scan_${Date.now()}.jpg`;

      // 1. Safe image upload
      if (imageUri && imageUri.startsWith('data:')) {
        try {
          const res = await fetch(imageUri);
          const blob = await res.blob();
          const fileName = `scan_${Date.now()}.jpg`;
          const { data: uploadData } = await supabase.storage
            .from('scan-uploads')
            .upload(`bystander/${fileName}`, blob, { contentType: 'image/jpeg', upsert: true });

          if (uploadData?.path) {
            imageRef = uploadData.path;
          }
        } catch (storageErr) {
          console.warn('[Storage upload notice]:', storageErr);
        }
      }

      // 2. Invoke Edge Function (on-victim-scan)
      let edgeData: any = null;
      try {
        const { data, error } = await supabase.functions.invoke('on-victim-scan', {
          body: {
            scan_mode: mode,
            image_ref: imageRef,
            bystander_lat: coords.lat,
            bystander_lng: coords.lng,
          },
        });
        if (!error && data) edgeData = data;
      } catch (e) {
        console.warn('[Edge function notice]:', e);
      }

      // 3. Check for registered patient in session storage or local storage
      const regSession = sessionStorage.getItem('damlink_registered_patient') || localStorage.getItem('damlink_registered_patient');
      let registeredLocal: any = null;
      if (regSession) {
        try { registeredLocal = JSON.parse(regSession); } catch (e) {}
      }

      // 4. Match Decision (Exactly matching Expo app logic)
      if (edgeData?.matched && edgeData?.patient) {
        // Real match found from AWS Rekognition / OCR / Database
        sessionStorage.setItem(
          'damlink_match_data',
          JSON.stringify({
            matched: true,
            patient: edgeData.patient,
            request_id: edgeData.request_id || `req_${Date.now()}`,
            hospital: edgeData.hospital || {
              id: '11111111-0000-0000-0000-000000000002',
              name: 'Nasser Institute Hospital',
              address: 'Corniche El Nile, Shubra, Cairo',
              eta_minutes: 15,
            },
          })
        );
        setTimeout(() => router.push('/bystander/match-result'), 1200);
      } else if (registeredLocal) {
        // Registered patient in active browser session
        sessionStorage.setItem(
          'damlink_match_data',
          JSON.stringify({
            matched: true,
            patient: registeredLocal,
            request_id: `req_${Date.now()}`,
            hospital: edgeData?.hospital || {
              id: '11111111-0000-0000-0000-000000000002',
              name: 'Nasser Institute Hospital',
              address: 'Corniche El Nile, Shubra, Cairo',
              eta_minutes: 15,
            },
          })
        );
        setTimeout(() => router.push('/bystander/match-result'), 1200);
      } else {
        // No match in patient registry — Go to /bystander/no-match exactly like main app
        setTimeout(() => router.push('/bystander/no-match'), 1200);
      }
    } catch (err) {
      console.error(err);
      setTimeout(() => router.push('/bystander/no-match'), 1200);
    }
  };

  return (
    <div className={styles.scanningScreen}>
      <div className={styles.pulseOuter}>
        <div className={styles.pulseInner}>
          <ScanFace size={52} color="#FFFFFF" />
        </div>
      </div>

      <h2 className={styles.scanningTitle}>Scanning…</h2>
      <p className={styles.scanningSubtitle}>Please wait while we identify the victim</p>

      <div className={styles.stepsCard}>
        {STEPS.map((label, i) => (
          <div key={i} className={styles.stepRow}>
            <div className={styles.stepIconWrap}>
              {i < currentStep ? (
                <CheckCircle size={20} color="#1EA35A" />
              ) : i === currentStep ? (
                <Loader2 size={16} color="#FFFFFF" className="animate-spin" />
              ) : (
                <div className={styles.stepDot} />
              )}
            </div>
            <span
              className={`${styles.stepLabel} ${i < currentStep ? styles.stepLabelDone : ''} ${
                i === currentStep ? styles.stepLabelActive : ''
              }`}
            >
              {label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ScanningPage() {
  return (
    <Suspense fallback={<div className={styles.scanningScreen}>Loading...</div>}>
      <ScanningContent />
    </Suspense>
  );
}
