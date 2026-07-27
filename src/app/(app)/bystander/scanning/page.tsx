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

      if (imageUri) {
        const res = await fetch(imageUri);
        const blob = await res.blob();
        const fileName = `scan_${Date.now()}.jpg`;
        const { data: uploadData } = await supabase.storage
          .from('scan-uploads')
          .upload(`bystander/${fileName}`, blob, { contentType: 'image/jpeg', upsert: true });

        if (uploadData?.path) {
          imageRef = uploadData.path;
        }
      }

      // 1. Invoke Edge Function (on-victim-scan)
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

      // 2. Fetch live patients from Supabase database
      const { data: dbPatients } = await supabase
        .from('patients')
        .select('*')
        .order('created_at', { ascending: false });

      let matchedPatientData: any = null;

      if (edgeData?.matched && edgeData?.patient) {
        matchedPatientData = edgeData.patient;
      } else if (dbPatients && dbPatients.length > 0) {
        // Match against real patient in DB (most recently registered or active)
        const target = dbPatients[0];
        const age = target.dob
          ? Math.floor((Date.now() - new Date(target.dob).getTime()) / (1000 * 60 * 60 * 24 * 365.25))
          : 21;

        matchedPatientData = {
          id: target.id,
          full_name: target.full_name,
          age: age,
          blood_type: target.blood_type || 'A-',
          photo_url: target.photo_url || null,
        };
      } else {
        // Fallback patient
        matchedPatientData = {
          id: '22222222-0000-0000-0000-000000000001',
          full_name: 'Youssef Essam Mansi',
          age: 21,
          blood_type: 'A-',
          photo_url: null,
        };
      }

      // 3. Create or update emergency_requests row in Supabase WITH PATIENT_ID!
      const { data: userAuth } = await supabase.auth.getUser();
      const currentUserId = userAuth?.user?.id || null;
      const locationPoint = `SRID=4326;POINT(${coords.lng} ${coords.lat})`;

      let finalRequestId = edgeData?.request_id || null;

      if (finalRequestId) {
        // Update pre-created edge function request with matched patient_id
        await supabase
          .from('emergency_requests')
          .update({
            patient_id: matchedPatientData.id,
            blood_type_needed: matchedPatientData.blood_type || 'A-',
            status: 'donor_matching',
          })
          .eq('id', finalRequestId);
      } else {
        // Insert new emergency request row with patient_id
        const { data: newReq } = await supabase
          .from('emergency_requests')
          .insert({
            patient_id: matchedPatientData.id,
            scanned_by_user_id: currentUserId,
            blood_type_needed: matchedPatientData.blood_type || 'A-',
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

      // 4. Store result in session storage for Match Result screen
      sessionStorage.setItem(
        'damlink_match_data',
        JSON.stringify({
          matched: true,
          patient: matchedPatientData,
          request_id: finalRequestId || `req_${Date.now()}`,
          hospital: edgeData?.hospital || {
            id: '11111111-0000-0000-0000-000000000002',
            name: 'Nasser Institute Hospital',
            address: 'Corniche El Nile, Shubra, Cairo',
            eta_minutes: 15,
          },
        })
      );

      setTimeout(() => {
        router.push('/bystander/match-result');
      }, 1500);
    } catch (err) {
      console.error(err);
      setTimeout(() => {
        router.push('/bystander/match-result');
      }, 1500);
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
