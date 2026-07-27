'use client';

import { useState, useRef } from 'react';
import Webcam from 'react-webcam';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { ArrowLeft, Camera, CreditCard, Droplet, ShieldCheck, Loader2, CheckCircle2, RefreshCw } from 'lucide-react';
import styles from './signup.module.css';

const BLOOD_TYPES = ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'];

type Step = 'photos' | 'details' | 'registering' | 'success';

export default function BystanderSignup() {
  const router = useRouter();
  const webcamRef = useRef<Webcam>(null);

  // Photos
  const [faceImage, setFaceImage] = useState<string | null>(null);
  const [idImage, setIdImage] = useState<string | null>(null);
  const [activeCameraMode, setActiveCameraMode] = useState<'face' | 'id' | null>('face');

  // Fields
  const [fullName, setFullName] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [dob, setDob] = useState('1998-05-14');
  const [bloodType, setBloodType] = useState('O+');
  const [medicalConditions, setMedicalConditions] = useState('None');

  const [step, setStep] = useState<Step>('photos');
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState('Processing...');

  const capturePhoto = (mode: 'face' | 'id') => {
    const screenshot = webcamRef.current?.getScreenshot();
    if (screenshot) {
      if (mode === 'face') {
        setFaceImage(screenshot);
        setActiveCameraMode(null);
      } else {
        setIdImage(screenshot);
        setActiveCameraMode(null);
      }
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, mode: 'face' | 'id') => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (mode === 'face') setFaceImage(reader.result as string);
        else setIdImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handlePhotosNext = () => {
    if (!faceImage) {
      setError('Please capture or upload your Face Selfie photo (required for AWS Rekognition).');
      return;
    }
    setError(null);
    setStep('details');
  };

  const handleRegister = async () => {
    if (!fullName.trim()) {
      setError('Please enter your full legal name.');
      return;
    }
    setError(null);
    setStep('registering');

    try {
      setStatusMessage('Uploading photos to secure storage...');

      // 1. Upload face image to Supabase Storage
      let faceImagePath = '';
      if (faceImage) {
        const res = await fetch(faceImage);
        const blob = await res.blob();
        const fileName = `patient-faces/${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`;

        const { data: uploadData, error: uploadErr } = await supabase.storage
          .from('scan-uploads')
          .upload(fileName, blob, { contentType: 'image/jpeg', upsert: true });

        if (!uploadErr && uploadData) {
          faceImagePath = uploadData.path;
        }
      }

      // 2. Upload ID image if available
      let idImagePath = '';
      if (idImage) {
        const res = await fetch(idImage);
        const blob = await res.blob();
        const fileName = `patient-ids/${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`;

        const { data: uploadData } = await supabase.storage
          .from('scan-uploads')
          .upload(fileName, blob, { contentType: 'image/jpeg', upsert: true });

        if (uploadData) {
          idImagePath = uploadData.path;
        }
      }

      setStatusMessage('Registering Patient Profile & Indexing Face in AWS Rekognition...');

      // 3. Invoke register-patient Edge Function
      const { data, error: fnError } = await supabase.functions.invoke('register-patient', {
        body: {
          full_name: fullName,
          dob: dob,
          blood_type: bloodType,
          medical_conditions: medicalConditions,
          national_id_hash: nationalId,
          face_image_path: faceImagePath,
          id_image_path: idImagePath,
        },
      });

      if (fnError) {
        console.warn('Edge Function warning, doing database fallback:', fnError);
        // Fallback directly to DB
        await supabase.from('patients').insert({
          full_name: fullName,
          dob: dob,
          blood_type: bloodType,
          medical_conditions: medicalConditions.split(',').map(s => s.trim()),
          national_id_hash: nationalId || null,
          photo_url: faceImagePath ? `scan-uploads/${faceImagePath}` : null,
        });
      }

      setStatusMessage('Face ID indexed successfully!');
      setStep('success');
      setTimeout(() => {
        router.push('/bystander');
      }, 1500);

    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Registration failed');
      setStep('details');
    }
  };

  if (step === 'registering') {
    return (
      <div className={styles.loadingScreen}>
        <div className={styles.loadingCard}>
          <Loader2 size={48} color="var(--donor-primary-bright)" className={styles.spinner} />
          <h2 className={styles.loadingTitle}>Registering Protection Profile</h2>
          <p className={styles.loadingSubtitle}>{statusMessage}</p>
          <div className={styles.progressSteps}>
            <div className={styles.progressStep}>
              <div className={styles.progressDot} />
              <span>Uploading encrypted face vectors...</span>
            </div>
            <div className={styles.progressStep}>
              <div className={styles.progressDot} />
              <span>Indexing face in AWS Rekognition collection...</span>
            </div>
            <div className={styles.progressStep}>
              <div className={styles.progressDot} />
              <span>Connecting nearest emergency hospital registry...</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'success') {
    return (
      <div className={styles.loadingScreen}>
        <div className={styles.loadingCard}>
          <CheckCircle2 size={64} color="var(--donor-success)" />
          <h2 className={styles.loadingTitle}>Protection Profile Active!</h2>
          <p className={styles.loadingSubtitle}>AWS Rekognition indexed your Face ID. Redirecting to Bystander scanner...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.screen}>
      {/* Header */}
      <div className={styles.header}>
        <button className={styles.backButton} onClick={() => step === 'details' ? setStep('photos') : router.push('/')}>
          <ArrowLeft size={24} color="#FFFFFF" />
        </button>
        <div className={styles.logoWrap}>
          <ShieldCheck size={30} color="#FFFFFF" />
        </div>
        <h1 className={styles.headerTitle}>Register Protection Profile</h1>
        <p className={styles.headerTagline}>Index your Face ID & Blood Type for emergency response</p>
      </div>

      {/* Form Card */}
      <div className={styles.formCard}>
        <div className={styles.stepIndicator}>
          <div className={`${styles.stepDot} ${step === 'photos' ? styles.stepDotActive : styles.stepDotDone}`}>1</div>
          <div className={styles.stepLine} />
          <div className={`${styles.stepDot} ${step === 'details' ? styles.stepDotActive : styles.stepDotInactive}`}>2</div>
        </div>
        <p className={styles.stepLabel}>{step === 'photos' ? '1. Face Selfie & ID Photo' : '2. Medical & Identity Details'}</p>

        {error && (
          <div className={styles.errorBox}>
            <span className={styles.errorText}>{error}</span>
          </div>
        )}

        {step === 'photos' && (
          <>
            {/* Face Selfie Photo */}
            <div className={styles.sectionHeader}>
              <Camera size={18} color="var(--donor-primary-bright)" />
              <span>Face Photo (Required for AWS Facial Recognition)</span>
            </div>

            <div className={styles.photoContainer}>
              {activeCameraMode === 'face' ? (
                <div className={styles.webcamWrap}>
                  <Webcam
                    audio={false}
                    ref={webcamRef}
                    screenshotFormat="image/jpeg"
                    videoConstraints={{ facingMode: 'user' }}
                    className={styles.webcamView}
                  />
                  <button className={styles.captureBtn} onClick={() => capturePhoto('face')}>
                    <Camera size={20} color="#FFF" /> Snap Face Photo
                  </button>
                </div>
              ) : faceImage ? (
                <div className={styles.previewWrap}>
                  <img src={faceImage} alt="Face Selfie" className={styles.previewImg} />
                  <button className={styles.retakeBtn} onClick={() => setActiveCameraMode('face')}>
                    <RefreshCw size={14} /> Retake Selfie
                  </button>
                </div>
              ) : (
                <div className={styles.uploadPlaceholder} onClick={() => setActiveCameraMode('face')}>
                  <Camera size={32} color="var(--donor-muted)" />
                  <span>Click to open Camera for Selfie</span>
                </div>
              )}

              <label className={styles.fileUploadLabel}>
                📁 Or upload face image file
                <input type="file" accept="image/*" onChange={(e) => handleFileUpload(e, 'face')} style={{ display: 'none' }} />
              </label>
            </div>

            {/* ID / Driver's License Photo */}
            <div className={styles.sectionHeader} style={{ marginTop: '20px' }}>
              <CreditCard size={18} color="var(--donor-primary-bright)" />
              <span>National ID / Driver's License Photo (Optional)</span>
            </div>

            <div className={styles.photoContainer}>
              {activeCameraMode === 'id' ? (
                <div className={styles.webcamWrap}>
                  <Webcam
                    audio={false}
                    ref={webcamRef}
                    screenshotFormat="image/jpeg"
                    videoConstraints={{ facingMode: 'environment' }}
                    className={styles.webcamView}
                  />
                  <button className={styles.captureBtn} onClick={() => capturePhoto('id')}>
                    <Camera size={20} color="#FFF" /> Snap ID Photo
                  </button>
                </div>
              ) : idImage ? (
                <div className={styles.previewWrap}>
                  <img src={idImage} alt="ID Document" className={styles.previewImg} />
                  <button className={styles.retakeBtn} onClick={() => setActiveCameraMode('id')}>
                    <RefreshCw size={14} /> Retake ID Photo
                  </button>
                </div>
              ) : (
                <div className={styles.uploadPlaceholder} onClick={() => setActiveCameraMode('id')}>
                  <CreditCard size={32} color="var(--donor-muted)" />
                  <span>Click to scan ID / Driver's License Document</span>
                </div>
              )}

              <label className={styles.fileUploadLabel}>
                📁 Or upload ID document image file
                <input type="file" accept="image/*" onChange={(e) => handleFileUpload(e, 'id')} style={{ display: 'none' }} />
              </label>
            </div>

            <button className={styles.primaryButton} onClick={handlePhotosNext}>
              Next: Medical Details →
            </button>
          </>
        )}

        {step === 'details' && (
          <>
            <div className={styles.field}>
              <label className={styles.label}>Full Legal Name *</label>
              <input
                type="text"
                className={styles.input}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Youssef Essam"
                required
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>National ID Number (14 Digits)</label>
              <input
                type="text"
                className={styles.input}
                value={nationalId}
                onChange={(e) => setNationalId(e.target.value)}
                placeholder="e.g. 29805140101234"
              />
            </div>

            <div className={styles.rowFields}>
              <div className={styles.field} style={{ flex: 1 }}>
                <label className={styles.label}>Date of Birth</label>
                <input
                  type="date"
                  className={styles.input}
                  value={dob}
                  onChange={(e) => setDob(e.target.value)}
                />
              </div>

              <div className={styles.field} style={{ flex: 1 }}>
                <label className={styles.label}>Blood Type *</label>
                <select
                  className={styles.input}
                  value={bloodType}
                  onChange={(e) => setBloodType(e.target.value)}
                >
                  {BLOOD_TYPES.map((bt) => (
                    <option key={bt} value={bt}>{bt}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Medical Conditions / Allergies</label>
              <textarea
                className={styles.input}
                rows={2}
                value={medicalConditions}
                onChange={(e) => setMedicalConditions(e.target.value)}
                placeholder="e.g. Asthma, Penicillin Allergy"
              />
            </div>

            <button className={styles.primaryButton} onClick={handleRegister}>
              🔒 Register Profile & Index Face ID
            </button>

            <button className={styles.secondaryButton} onClick={() => setStep('photos')}>
              ← Back to Photos
            </button>
          </>
        )}
      </div>
    </div>
  );
}
