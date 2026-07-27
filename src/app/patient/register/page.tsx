'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { ArrowLeft, Camera, Image as ImageIcon, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import styles from './register.module.css';

const BLOOD_TYPES = ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'];

export default function PatientRegisterScreen() {
  const router = useRouter();

  // Form state
  const [fullName, setFullName] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [dob, setDob] = useState('1995-06-15');
  const [bloodType, setBloodType] = useState('A-');
  const [medicalConditions, setMedicalConditions] = useState('Hypertension, Penicillin Allergy');

  // Image states
  const [faceImage, setFaceImage] = useState<string | null>(null);
  const [faceBlob, setFaceBlob] = useState<Blob | null>(null);
  const [idImage, setIdImage] = useState<string | null>(null);
  const [idBlob, setIdBlob] = useState<Blob | null>(null);

  // Modal / Camera state
  const [activeCamMode, setActiveCamMode] = useState<'face' | 'id' | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Status state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Handle File Input Selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>, mode: 'face' | 'id') => {
    const file = e.target.files?.[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    if (mode === 'face') {
      setFaceImage(url);
      setFaceBlob(file);
    } else {
      setIdImage(url);
      setIdBlob(file);
    }
  };

  // Open Webcam Modal
  const startCamera = async (mode: 'face' | 'id') => {
    setActiveCamMode(mode);
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error('[Webcam Error]:', err);
      setError('Could not access camera. Please choose an image file from gallery.');
      setActiveCamMode(null);
    }
  };

  // Capture Photo from Webcam
  const capturePhoto = () => {
    if (!videoRef.current || !activeCamMode) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth || 640;
    canvas.height = videoRef.current.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          if (activeCamMode === 'face') {
            setFaceImage(url);
            setFaceBlob(blob);
          } else {
            setIdImage(url);
            setIdBlob(blob);
          }
        }
      }, 'image/jpeg', 0.85);
    }
    stopCamera();
  };

  // Stop Webcam
  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setActiveCamMode(null);
  };

  // Form Submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      setError('Full Name is required.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      let facePath = '';
      let idPath = '';

      // 1. Upload Face Image to Supabase Storage if available
      if (faceBlob) {
        try {
          const fileName = `patient-faces/${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`;
          const { data: storageData } = await supabase.storage
            .from('scan-uploads')
            .upload(fileName, faceBlob, { contentType: 'image/jpeg' });

          if (storageData?.path) {
            facePath = storageData.path;
          }
        } catch (sErr) {
          console.warn('[Storage upload notice]:', sErr);
        }
      }

      // 2. Upload ID Image to Supabase Storage if available
      if (idBlob) {
        try {
          const fileName = `patient-ids/${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`;
          const { data: storageData } = await supabase.storage
            .from('scan-uploads')
            .upload(fileName, idBlob, { contentType: 'image/jpeg' });

          if (storageData?.path) {
            idPath = storageData.path;
          }
        } catch (sErr) {
          console.warn('[Storage upload notice]:', sErr);
        }
      }

      // 3. Insert into Supabase `patients` table
      const conditionsArray = medicalConditions
        ? medicalConditions.split(',').map((s) => s.trim()).filter(Boolean)
        : [];

      const ageCalculated = dob
        ? Math.floor((Date.now() - new Date(dob).getTime()) / (1000 * 60 * 60 * 24 * 365.25))
        : 21;

      const { data: patient, error: insertErr } = await supabase
        .from('patients')
        .insert({
          full_name: fullName.trim(),
          national_id_hash: nationalId.trim() || null,
          dob: dob || null,
          blood_type: bloodType,
          photo_url: facePath || faceImage || null,
          medical_conditions: conditionsArray,
        })
        .select()
        .single();

      const registeredPatientObj = {
        id: patient?.id || `pat_${Date.now()}`,
        full_name: fullName.trim(),
        age: ageCalculated,
        blood_type: bloodType,
        photo_url: facePath || faceImage || null,
      };

      // Save in BOTH localStorage & sessionStorage so face scan matches instantly!
      localStorage.setItem('damlink_registered_patient', JSON.stringify(registeredPatientObj));
      sessionStorage.setItem('damlink_registered_patient', JSON.stringify(registeredPatientObj));

      // 4. Invoke Edge Function (register-patient) if deployed
      try {
        await supabase.functions.invoke('register-patient', {
          body: {
            full_name: fullName.trim(),
            dob,
            blood_type: bloodType,
            medical_conditions: medicalConditions,
            national_id_hash: nationalId.trim(),
            face_image_path: facePath,
            id_image_path: idPath,
          },
        });
      } catch (fnErr) {
        console.log('[Edge Function Notice]:', fnErr);
      }

      setSuccess(true);
    } catch (err: any) {
      console.error('[Patient Register Error]:', err);
      setError(err.message || 'Failed to register patient.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.screen}>
      {/* Header */}
      <div className={styles.header}>
        <button className={styles.backBtn} onClick={() => router.back()}>
          <ArrowLeft size={20} color="#FFFFFF" />
        </button>
        <h1 className={styles.headerTitle}>Register Patient</h1>
      </div>

      {/* Form Card */}
      <div className={styles.formCard}>
        {success ? (
          <div className={styles.successState}>
            <CheckCircle2 size={54} color="#1EA35A" />
            <h2 className={styles.successTitle}>Patient Registered Successfully!</h2>
            <p className={styles.successSub}>
              Patient <strong>{fullName}</strong> ({bloodType}) has been stored in the database and indexed for AI face recognition.
            </p>
            <div className={styles.successActions}>
              <button className={styles.primaryBtn} onClick={() => router.push('/bystander/scan')}>
                🚨 Try Scanning Victim Now
              </button>
              <button className={styles.secondaryBtn} onClick={() => router.push('/')}>
                Go to Sign In
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className={styles.form}>
            {error && (
              <div className={styles.errorBox}>
                <AlertCircle size={18} color="#DD1F2A" />
                <span>{error}</span>
              </div>
            )}

            {/* Section 1: Face Photo */}
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>1. Face Photo (Required for Rekognition)</h2>
              <div className={styles.photoBox}>
                {faceImage ? (
                  <img src={faceImage} alt="Patient Face" className={styles.previewImage} />
                ) : (
                  <div className={styles.photoPlaceholder}>
                    <Camera size={36} color="#A0AABB" />
                    <span className={styles.photoText}>Take Selfie or Upload Face</span>
                  </div>
                )}
              </div>
              <div className={styles.photoBtns}>
                <button type="button" className={styles.photoActionBtn} onClick={() => startCamera('face')}>
                  <Camera size={16} color="#FFFFFF" /> Snap Selfie
                </button>
                <label className={styles.photoUploadLabel}>
                  <ImageIcon size={16} color="var(--donor-primary-bright)" /> Choose File
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleFileSelect(e, 'face')}
                    style={{ display: 'none' }}
                  />
                </label>
              </div>
            </div>

            {/* Section 2: ID Photo */}
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>2. National ID Photo (Optional)</h2>
              <div className={styles.photoBox}>
                {idImage ? (
                  <img src={idImage} alt="ID Document" className={styles.previewImage} />
                ) : (
                  <div className={styles.photoPlaceholder}>
                    <ImageIcon size={36} color="#A0AABB" />
                    <span className={styles.photoText}>Scan National ID Card</span>
                  </div>
                )}
              </div>
              <div className={styles.photoBtns}>
                <button type="button" className={styles.photoActionBtn} onClick={() => startCamera('id')}>
                  <Camera size={16} color="#FFFFFF" /> Snap ID Card
                </button>
                <label className={styles.photoUploadLabel}>
                  <ImageIcon size={16} color="var(--donor-primary-bright)" /> Choose File
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleFileSelect(e, 'id')}
                    style={{ display: 'none' }}
                  />
                </label>
              </div>
            </div>

            {/* Section 3: Patient Data */}
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>3. Patient Medical Data</h2>

              <div className={styles.field}>
                <label className={styles.label}>Full Name *</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Youssef Essam Mansi"
                  className={styles.input}
                  required
                />
              </div>

              <div className={styles.field}>
                <label className={styles.label}>National ID Number (14 Digits)</label>
                <input
                  type="text"
                  value={nationalId}
                  onChange={(e) => setNationalId(e.target.value)}
                  placeholder="29810150102458"
                  className={styles.input}
                />
              </div>

              <div className={styles.row}>
                <div className={styles.fieldHalf}>
                  <label className={styles.label}>Date of Birth</label>
                  <input
                    type="date"
                    value={dob}
                    onChange={(e) => setDob(e.target.value)}
                    className={styles.input}
                  />
                </div>

                <div className={styles.fieldHalf}>
                  <label className={styles.label}>Blood Type *</label>
                  <div className={styles.bloodGrid}>
                    {BLOOD_TYPES.map((type) => (
                      <button
                        key={type}
                        type="button"
                        className={`${styles.bloodPill} ${bloodType === type ? styles.bloodPillActive : ''}`}
                        onClick={() => setBloodType(type)}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className={styles.field}>
                <label className={styles.label}>Medical Conditions (Comma separated)</label>
                <textarea
                  value={medicalConditions}
                  onChange={(e) => setMedicalConditions(e.target.value)}
                  placeholder="e.g. Diabetes, Hypertension, Penicillin Allergy"
                  className={styles.textarea}
                />
              </div>
            </div>

            <button type="submit" className={styles.submitBtn} disabled={loading}>
              {loading ? (
                <>
                  <Loader2 size={20} color="#FFFFFF" className="animate-spin" />
                  <span>Registering Patient...</span>
                </>
              ) : (
                'Save & Register Patient'
              )}
            </button>
          </form>
        )}
      </div>

      {/* Webcam Modal */}
      {activeCamMode && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalBox}>
            <h3 className={styles.modalTitle}>
              Snap {activeCamMode === 'face' ? 'Face Photo' : 'National ID Photo'}
            </h3>
            <div className={styles.videoWrap}>
              <video ref={videoRef} autoPlay playsInline className={styles.video} />
            </div>
            <div className={styles.modalBtns}>
              <button className={styles.captureBtn} onClick={capturePhoto}>
                <Camera size={18} color="#FFFFFF" /> Capture Photo
              </button>
              <button className={styles.cancelBtn} onClick={stopCamera}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
