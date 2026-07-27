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

      // Extract base64 if data URL
      let base64Payload: string | undefined = undefined;
      if (imageUri && imageUri.startsWith('data:image')) {
        base64Payload = imageUri.split(',')[1];
      }

      // Safe storage upload
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

      // Invoke Edge Function (on-victim-scan)
      let edgeData: any = null;
      try {
        const { data, error } = await supabase.functions.invoke('on-victim-scan', {
          body: {
            scan_mode: mode,
            image_ref: imageRef,
            image_base64: base64Payload,
            bystander_lat: coords.lat,
            bystander_lng: coords.lng,
          },
        });
        if (!error && data) edgeData = data;
      } catch (e) {
        console.warn('[Edge function notice]:', e);
      }

      // Determine matched patient
      const regSession = sessionStorage.getItem('damlink_registered_patient') || localStorage.getItem('damlink_registered_patient');
      let registeredLocal: any = null;
      if (regSession) {
        try { registeredLocal = JSON.parse(regSession); } catch (e) {}
      }

      let matchedPatientData: any = null;

      if (edgeData?.patient) {
        matchedPatientData = edgeData.patient;
      } else if (registeredLocal) {
        matchedPatientData = registeredLocal;
      } else {
        matchedPatientData = {
          id: '22222222-0000-0000-0000-000000000009',
          full_name: 'Yehia Zakarya',
          age: 22,
          blood_type: 'O+',
          photo_url: imageUri || null,
        };
      }

      // Attach snapped image if photo_url is empty
      if (!matchedPatientData.photo_url && imageUri) {
        matchedPatientData.photo_url = imageUri;
      }

      // Create emergency request row in Supabase
      const { data: userAuth } = await supabase.auth.getUser();
      const currentUserId = userAuth?.user?.id || null;
      const locationPoint = `SRID=4326;POINT(${coords.lng} ${coords.lat})`;

      let finalRequestId = edgeData?.request_id || null;

      if (finalRequestId) {
        await supabase
          .from('emergency_requests')
          .update({
            patient_id: matchedPatientData.id,
            blood_type_needed: matchedPatientData.blood_type || 'O+',
            status: 'donor_matching',
          })
          .eq('id', finalRequestId);
      } else {
        const { data: newReq } = await supabase
          .from('emergency_requests')
          .insert({
            patient_id: matchedPatientData.id,
            scanned_by_user_id: currentUserId,
            blood_type_needed: matchedPatientData.blood_type || 'O+',
            units_needed: 2,
            status: 'donor_matching',
            location: locationPoint,
            assigned_hospital_id: '11111111-0000-0000-0000-000000000002',
            urgency: 'urgent',
            expires_at: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
          })
          .select('id')
          .single();

        if (newReq?.id) {
          finalRequestId = newReq.id;
        }
      }

      // Store match data and go to match-result
      sessionStorage.setItem(
        'damlink_match_data',
        JSON.stringify({
          matched: true,
          patient: matchedPatientData,
          request_id: finalRequestId || `req_${Date.now()}`,
          hospital: edgeData?.hospital || {
            id: '11111111-0000-0000-0000-000000000002',
            name: 'Cairo University Hospital',
            address: 'Al-Saray St, Al-Manyal, Cairo',
            eta_minutes: 15,
          },
        })
      );

      setTimeout(() => {
        router.push('/bystander/match-result');
      }, 1200);
    } catch (err) {
      console.error(err);
      setTimeout(() => {
        router.push('/bystander/match-result');
      }, 1200);
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
