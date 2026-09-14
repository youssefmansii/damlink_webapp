'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { ScanFace, CheckCircle, Loader2 } from 'lucide-react';
import styles from './scanning.module.css';

const STEP_LABELS: Record<string, string[]> = {
  face: [
    'Uploading image securely…',
    'Running facial recognition (AWS Rekognition)…',
    'Matching against patient registry…',
    'Retrieving patient profile…',
  ],
  national_id: [
    'Uploading image securely…',
    'Running Egyptian National ID OCR…',
    'Validating extracted ID number…',
    'Looking up patient record…',
  ],
  drivers_license: [
    'Uploading image securely…',
    "Running Google Cloud Vision on Driver's License…",
    'Extracting identity fields…',
    'Looking up patient record…',
  ],
  university_id: [
    'Uploading image securely…',
    'Running OCR on University ID…',
    'Extracting identity fields…',
    'Looking up patient record…',
  ],
};

function ScanningContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mode = searchParams.get('mode') || 'face';
  const steps = STEP_LABELS[mode] || STEP_LABELS['face'];
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    runScanProcess();
  }, []);

  useEffect(() => {
    if (currentStep < steps.length - 1) {
      const t = setTimeout(() => setCurrentStep((s) => s + 1), 1000);
      return () => clearTimeout(t);
    }
  }, [currentStep, steps.length]);

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

      let base64Payload: string | undefined = undefined;
      if (imageUri && imageUri.startsWith('data:image')) {
        base64Payload = imageUri.split(',')[1];
      }

      // Invoke the on-victim-scan Edge Function
      const { data, error } = await supabase.functions.invoke('on-victim-scan', {
        body: {
          scan_mode: mode,
          image_ref: imageRef,
          image_base64: base64Payload,
          bystander_lat: coords.lat,
          bystander_lng: coords.lng,
        },
      });

      if (error) {
        throw error;
      }

      const patientObj = data?.patient;

      if (!data?.matched || !patientObj) {
        router.push(`/bystander/no-match?reason=no_match&mode=${mode}`);
        return;
      }

      // Attach snapped image if photo_url is empty
      if (imageUri && (!patientObj.photo_url || patientObj.photo_url.startsWith('patient-faces'))) {
        patientObj.photo_url = imageUri;
      }

      sessionStorage.setItem(
        'damlink_match_data',
        JSON.stringify({
          matched: true,
          patient: patientObj,
          request_id: data?.request_id || `req_${Date.now()}`,
          hospital: data?.hospital ?? null,
        })
      );

      setTimeout(() => {
        router.push('/bystander/match-result');
      }, 800);
    } catch (err) {
      console.error('[Scanning] Error:', err);
      router.push(`/bystander/no-match?reason=scan_error&mode=${mode}`);
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
        {steps.map((label, i) => (
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
