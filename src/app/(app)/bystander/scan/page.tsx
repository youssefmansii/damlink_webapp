'use client';

import { useState, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Webcam from 'react-webcam';
import { ArrowLeft, User, CreditCard, Car, GraduationCap, Info, Camera, Image as ImageIcon, Search, RotateCcw, X, Loader2 } from 'lucide-react';
import styles from './scan.module.css';

type ScanMode = 'face' | 'national_id' | 'drivers_license' | 'university_id';

const MODE_LABELS: Record<ScanMode, string> = {
  face: 'Face Scan',
  national_id: 'National ID',
  drivers_license: "Driver's License",
  university_id: 'University ID',
};

const MODE_ICONS: Record<ScanMode, any> = {
  face: User,
  national_id: CreditCard,
  drivers_license: Car,
  university_id: GraduationCap,
};

const MODE_INSTRUCTIONS: Record<ScanMode, string> = {
  face: "Position the victim's face clearly in frame. Ensure good lighting and minimal obstructions.",
  national_id: 'Capture the front of the National ID card. Ensure all text is clearly visible.',
  drivers_license: "Capture the front of the driver's license. Ensure the name and photo are visible.",
  university_id: 'Capture the university ID card. Ensure the name and photo are clearly visible.',
};

function ScanContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialMode = (searchParams.get('mode') as ScanMode) || 'face';

  const [selectedMode, setSelectedMode] = useState<ScanMode>(initialMode);
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const [showWebcamModal, setShowWebcamModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const webcamRef = useRef<Webcam>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCaptureWebcam = () => {
    const imageSrc = webcamRef.current?.getScreenshot();
    if (imageSrc) {
      setCapturedUri(imageSrc);
      setShowWebcamModal(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setCapturedUri(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmitScan = () => {
    if (!capturedUri) return;
    setSubmitting(true);

    // Store captured image in session storage for the scanning step
    sessionStorage.setItem('damlink_scan_image', capturedUri);
    sessionStorage.setItem('damlink_scan_mode', selectedMode);

    setTimeout(() => {
      router.push(`/bystander/scanning?mode=${selectedMode}`);
    }, 300);
  };

  const SelectedIcon = MODE_ICONS[selectedMode];

  return (
    <div className={styles.screen}>
      {/* Red Header */}
      <div className={styles.header}>
        <button className={styles.backButton} onClick={() => router.push('/bystander')}>
          <ArrowLeft size={24} color="#FFFFFF" />
        </button>
        <h1 className={styles.headerTitle}>Scan Victim</h1>
      </div>

      <div className={styles.content}>
        {/* Scan Type Horizontal Pills */}
        <div className={styles.sectionLabel}>Scan Type</div>
        <div className={styles.modeRow}>
          {(Object.keys(MODE_LABELS) as ScanMode[]).map((m) => {
            const IconComp = MODE_ICONS[m];
            const isActive = selectedMode === m;
            return (
              <button
                key={m}
                className={`${styles.modeChip} ${isActive ? styles.modeChipActive : ''}`}
                onClick={() => {
                  setSelectedMode(m);
                  setCapturedUri(null);
                }}
              >
                <IconComp size={16} color={isActive ? '#FFFFFF' : '#667085'} />
                <span>{MODE_LABELS[m]}</span>
              </button>
            );
          })}
        </div>

        {/* Instructions Box */}
        <div className={styles.instructionBox}>
          <Info size={18} color="#DD1F2A" className={styles.infoIcon} />
          <p className={styles.instructionText}>{MODE_INSTRUCTIONS[selectedMode]}</p>
        </div>

        {/* Camera Preview / Placeholder Area */}
        {capturedUri ? (
          <div className={styles.previewWrap}>
            <img src={capturedUri} alt="Victim scan preview" className={styles.previewImage} />
            <button className={styles.retakeButton} onClick={() => setCapturedUri(null)}>
              <RotateCcw size={16} color="#FFFFFF" />
              <span>Retake</span>
            </button>
          </div>
        ) : (
          <div className={styles.cameraPlaceholder}>
            <div className={styles.placeholderIconWrap}>
              <SelectedIcon size={48} color="#C8D2E6" />
            </div>
            <span className={styles.placeholderText}>No image captured yet</span>
          </div>
        )}

        {/* Action Buttons */}
        <button className={styles.captureButton} onClick={() => setShowWebcamModal(true)}>
          <Camera size={22} color="#FFFFFF" />
          <span>{capturedUri ? 'Retake with Camera' : 'Open Camera'}</span>
        </button>

        <button className={styles.galleryButton} onClick={() => fileInputRef.current?.click()}>
          <ImageIcon size={20} color="#DD1F2A" />
          <span>Choose from Gallery</span>
        </button>
        <input
          type="file"
          accept="image/*"
          ref={fileInputRef}
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />

        {/* Submit Button (Appears when image captured) */}
        {capturedUri && (
          <button
            className={styles.submitButton}
            onClick={handleSubmitScan}
            disabled={submitting}
          >
            {submitting ? (
              <Loader2 size={20} color="#FFFFFF" className="animate-spin" />
            ) : (
              <>
                <Search size={20} color="#FFFFFF" />
                <span>Identify Victim</span>
              </>
            )}
          </button>
        )}

        <p className={styles.privacyNote}>
          Images are processed securely via encrypted channels. Face data is matched against the DamLink patient registry only.
        </p>
      </div>

      {/* Camera Viewfinder Modal */}
      {showWebcamModal && (
        <div className={styles.webcamModal}>
          <button className={styles.closeWebcamBtn} onClick={() => setShowWebcamModal(false)}>
            <X size={24} color="#FFFFFF" />
          </button>

          <Webcam
            audio={false}
            ref={webcamRef}
            screenshotFormat="image/jpeg"
            videoConstraints={{ facingMode: 'user' }}
            className={styles.webcamView}
          />

          <div className={styles.snapBtnWrap}>
            <button className={styles.snapBtn} onClick={handleCaptureWebcam}>
              <Camera size={32} color="#DD1F2A" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ScanPage() {
  return (
    <Suspense fallback={<div className={styles.screen}><div className={styles.content}>Loading...</div></div>}>
      <ScanContent />
    </Suspense>
  );
}
