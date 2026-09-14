'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import {
  AlertCircle,
  ArrowLeft,
  Camera,
  CheckCircle2,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Loader2,
  Save,
  ShieldCheck,
} from 'lucide-react';
import {
  defaultDonorEligibilityAnswers,
  evaluateDonorEligibility,
  type DonorEligibilityAnswers,
} from '@/lib/donorEligibility';
import styles from './register.module.css';

const BLOOD_TYPES = ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'];

export default function PatientRegisterScreen() {
  const router = useRouter();

  // Form state
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [dob, setDob] = useState('');
  const [bloodType, setBloodType] = useState('A-');
  const [medicalConditions, setMedicalConditions] = useState('');
  const [isActiveDonor, setIsActiveDonor] = useState(false);
  const [eligibilityAnswers, setEligibilityAnswers] = useState<DonorEligibilityAnswers>(defaultDonorEligibilityAnswers);
  const [showPassword, setShowPassword] = useState(false);

  // Image state
  const [faceImage, setFaceImage] = useState<string | null>(null);
  const [faceBlob, setFaceBlob] = useState<Blob | null>(null);

  // Modal / Camera state
  const [activeCamMode, setActiveCamMode] = useState<'face' | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Status state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const eligibility = evaluateDonorEligibility(eligibilityAnswers, dob);
  const canActivateDonor = eligibility.status === 'eligible';

  const updateEligibility = <K extends keyof DonorEligibilityAnswers>(
    key: K,
    value: DonorEligibilityAnswers[K],
  ) => {
    setEligibilityAnswers((current) => ({ ...current, [key]: value }));
  };

  // Handle File Input Selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    setFaceImage(url);
    setFaceBlob(file);
  };

  // Open Webcam Modal
  const startCamera = async () => {
    setActiveCamMode('face');
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
          setFaceImage(url);
          setFaceBlob(blob);
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
    if (!email.trim()) {
      setError('Email is required so the patient can sign in later.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (nationalId.trim() && !/^\d{14}$/.test(nationalId.trim())) {
      setError('National ID must be 14 digits.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // 1. Create the auth account first. This person can now sign in and edit their data.
      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: fullName.trim(),
            phone: phone.trim(),
            blood_type: bloodType,
            role: 'patient_donor',
          },
        },
      });

      if (signUpError) throw signUpError;
      const user = authData.user;
      if (!user) throw new Error('Could not create the user account.');

      const { error: profileErr } = await supabase.from('profiles').upsert({
        id: user.id,
        full_name: fullName.trim(),
        phone: phone.trim(),
        blood_type: bloodType,
        is_donor_registered: true,
      });

      if (profileErr) throw profileErr;

      const donorIsActive = isActiveDonor && canActivateDonor;

      const { error: donorErr } = await supabase.from('donor_profiles').upsert({
        user_id: user.id,
        is_active: donorIsActive,
        donor_weight_kg: eligibilityAnswers.weightKg ? Number(eligibilityAnswers.weightKg) : null,
        donor_last_donation_date: eligibilityAnswers.lastDonationDate || null,
        donor_health_answers: eligibilityAnswers,
        donor_eligibility_status: eligibility.status,
        donor_eligibility_reasons: eligibility.reasons,
        donor_eligibility_checked_at: new Date().toISOString(),
        donations_count: 0,
        lives_saved_estimate: 0,
        reliability_rating: 5.0,
        points_balance: 100,
      });

      if (donorErr) throw donorErr;

      let facePath = '';

      // 2. Upload Face Image to Supabase Storage if available
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

      const ageCalculated = dob
        ? Math.floor((Date.now() - new Date(dob).getTime()) / (1000 * 60 * 60 * 24 * 365.25))
        : 21;

      // 3. Create the linked patient record through the Edge Function so Rekognition indexing still works.
      let patient: any = null;
      const { data: fnData, error: fnErr } = await supabase.functions.invoke('register-patient', {
        body: {
          profile_id: user.id,
          full_name: fullName.trim(),
          dob,
          blood_type: bloodType,
          medical_conditions: medicalConditions,
          national_id_hash: nationalId.trim(),
          face_image_path: facePath,
        },
      });

      if (fnErr) {
        console.warn('[Edge Function Notice]:', fnErr);

        const conditionsArray = medicalConditions
          ? medicalConditions.split(',').map((s) => s.trim()).filter(Boolean)
          : [];

        const { data: fallbackPatient, error: insertErr } = await supabase
          .from('patients')
          .insert({
            profile_id: user.id,
            full_name: fullName.trim(),
            national_id_hash: nationalId.trim() || null,
            dob: dob || null,
            blood_type: bloodType,
            photo_url: facePath || faceImage || null,
            medical_conditions: conditionsArray,
          })
          .select()
          .single();

        if (insertErr) throw insertErr;
        patient = fallbackPatient;
      } else {
        patient = {
          id: fnData?.patient_id,
          full_name: fullName.trim(),
          blood_type: bloodType,
          photo_url: facePath || faceImage || null,
        };
      }

      const registeredPatientObj = {
        id: patient?.id || `pat_${Date.now()}`,
        full_name: fullName.trim(),
        age: ageCalculated,
        blood_type: bloodType,
        photo_url: facePath || faceImage || null,
      };

      localStorage.setItem('damlink_registered_patient', JSON.stringify(registeredPatientObj));
      sessionStorage.setItem('damlink_registered_patient', JSON.stringify(registeredPatientObj));
      localStorage.setItem('damlink_mode', 'donor');

      if (isActiveDonor && !canActivateDonor) {
        setIsActiveDonor(false);
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
        <div>
          <h1 className={styles.headerTitle}>Create DamLink Account</h1>
          <p className={styles.headerSub}>Patient profile plus optional donor alerts</p>
        </div>
      </div>

      {/* Form Card */}
      <div className={styles.formCard}>
        {success ? (
          <div className={styles.successState}>
            <CheckCircle2 size={54} color="#1EA35A" />
            <h2 className={styles.successTitle}>Account Created Successfully</h2>
            <p className={styles.successSub}>
              <strong>{fullName}</strong> now has a patient medical profile and a donor account. Donor alerts are {isActiveDonor ? 'active' : 'paused'}.
            </p>
            <div className={styles.successActions}>
              <button className={styles.primaryBtn} onClick={() => router.push('/profile')}>
                Open Profile Settings
              </button>
              <button className={styles.secondaryBtn} onClick={() => router.push('/donor')}>
                Go to Donor Dashboard
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

            {/* Section 1: Account */}
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>1. Sign-in Account</h2>

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
                <label className={styles.label}>Phone Number</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+20 10 0000 0000"
                  className={styles.input}
                />
              </div>

              <div className={styles.field}>
                <label className={styles.label}>Email *</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className={styles.input}
                  required
                />
              </div>

              <div className={styles.field}>
                <label className={styles.label}>Password *</label>
                <div className={styles.passwordWrap}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min. 6 characters"
                    className={styles.passwordInput}
                    required
                  />
                  <button
                    type="button"
                    className={styles.eyeBtn}
                    onClick={() => setShowPassword((current) => !current)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={18} color="#7A8499" /> : <Eye size={18} color="#7A8499" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Section 2: Face Photo */}
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>2. Face Photo</h2>
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
                <button type="button" className={styles.photoActionBtn} onClick={startCamera}>
                  <Camera size={16} color="#FFFFFF" /> Snap Selfie
                </button>
                <label className={styles.photoUploadLabel}>
                  <ImageIcon size={16} color="var(--donor-primary-bright)" /> Choose File
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileSelect}
                    style={{ display: 'none' }}
                  />
                </label>
              </div>
            </div>

            {/* Section 3: Patient Data */}
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>3. Patient Medical Data</h2>

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

            {/* Section 4: Donor Status */}
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>4. Donation Safety Check</h2>
              <div className={`${styles.eligibilityPanel} ${canActivateDonor ? styles.eligibilityOk : styles.eligibilityBlocked}`}>
                <ShieldCheck size={20} color={canActivateDonor ? '#116339' : '#A44700'} />
                <div>
                  <strong>{canActivateDonor ? 'Eligible to receive donor alerts' : 'Donor alerts paused until eligible'}</strong>
                  <span>{eligibility.reasons[0]}</span>
                </div>
              </div>

              <div className={styles.row}>
                <div className={styles.fieldHalf}>
                  <label className={styles.label}>Weight (kg) *</label>
                  <input
                    type="number"
                    min="1"
                    value={eligibilityAnswers.weightKg}
                    onChange={(e) => updateEligibility('weightKg', e.target.value)}
                    placeholder="70"
                    className={styles.input}
                  />
                </div>

                <div className={styles.fieldHalf}>
                  <label className={styles.label}>Last donation</label>
                  <input
                    type="date"
                    value={eligibilityAnswers.lastDonationDate}
                    onChange={(e) => updateEligibility('lastDonationDate', e.target.value)}
                    className={styles.input}
                  />
                </div>
              </div>

              <div className={styles.checkGrid}>
                <label className={styles.checkRow}>
                  <input
                    type="checkbox"
                    checked={eligibilityAnswers.feelingWell}
                    onChange={(e) => updateEligibility('feelingWell', e.target.checked)}
                  />
                  <span>I feel well today</span>
                </label>
                <label className={styles.checkRow}>
                  <input
                    type="checkbox"
                    checked={eligibilityAnswers.takingAntibiotics}
                    onChange={(e) => updateEligibility('takingAntibiotics', e.target.checked)}
                  />
                  <span>Taking antibiotics or have infection</span>
                </label>
                <label className={styles.checkRow}>
                  <input
                    type="checkbox"
                    checked={eligibilityAnswers.recentTattooOrPiercing}
                    onChange={(e) => updateEligibility('recentTattooOrPiercing', e.target.checked)}
                  />
                  <span>Recent tattoo or piercing</span>
                </label>
                <label className={styles.checkRow}>
                  <input
                    type="checkbox"
                    checked={eligibilityAnswers.pregnantOrBreastfeeding}
                    onChange={(e) => updateEligibility('pregnantOrBreastfeeding', e.target.checked)}
                  />
                  <span>Pregnant or breastfeeding</span>
                </label>
                <label className={styles.checkRow}>
                  <input
                    type="checkbox"
                    checked={eligibilityAnswers.highRiskExposure}
                    onChange={(e) => updateEligibility('highRiskExposure', e.target.checked)}
                  />
                  <span>Recent high-risk exposure</span>
                </label>
                <label className={styles.checkRow}>
                  <input
                    type="checkbox"
                    checked={eligibilityAnswers.seriousMedicalCondition}
                    onChange={(e) => updateEligibility('seriousMedicalCondition', e.target.checked)}
                  />
                  <span>Serious chronic medical condition</span>
                </label>
              </div>

              <div className={styles.toggleRow}>
                <div>
                  <strong>Receive donor alerts</strong>
                  <span>{canActivateDonor ? (isActiveDonor ? 'You can receive nearby compatible requests.' : 'Your donor profile is saved, but alerts are paused.') : 'Complete the safety check first.'}</span>
                </div>
                <button
                  type="button"
                  className={`${styles.toggle} ${isActiveDonor ? styles.toggleOn : ''}`}
                  onClick={() => setIsActiveDonor((current) => (canActivateDonor ? !current : false))}
                  aria-pressed={isActiveDonor}
                  disabled={!canActivateDonor}
                >
                  <span />
                </button>
              </div>
            </div>

            <button type="submit" className={styles.submitBtn} disabled={loading}>
              {loading ? (
                <>
                  <Loader2 size={20} color="#FFFFFF" className="animate-spin" />
                  <span>Creating Account...</span>
                </>
              ) : (
                <>
                  <Save size={18} color="#FFFFFF" />
                  <span>Create Patient + Donor Account</span>
                </>
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
              Snap Face Photo
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
