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
  face: "Position the victim's face inside the oval. Keep the face well lit and unobstructed.",
  national_id: 'Place the front of the National ID inside the rectangle. Keep the number line sharp and visible.',
  drivers_license: "Place the front of the driver's license inside the rectangle. Keep the name and photo visible.",
  university_id: 'Place the university ID inside the rectangle. Keep the name and photo clearly visible.',
};

const GUIDE_LABELS: Record<ScanMode, string> = {
  face: 'Align face inside frame',
  national_id: 'Align National ID inside frame',
  drivers_license: "Align driver's license inside frame",
  university_id: 'Align university ID inside frame',
};

function ScanContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawMode = searchParams.get('mode');
  
  const initialMode: ScanMode = (rawMode === 'id' || rawMode === 'national_id')
    ? 'national_id'
    : (rawMode && rawMode in MODE_LABELS)
    ? (rawMode as ScanMode)
    : 'face';

  const [selectedMode, setSelectedMode] = useState<ScanMode>(initialMode);
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const [showWebcamModal, setShowWebcamModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const webcamRef = useRef<Webcam>(null);
  const guideRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const cropDocumentFromVideo = () => {
    const video = webcamRef.current?.video as HTMLVideoElement | null;
    const guide = guideRef.current;

    if (!video || !guide || !video.videoWidth || !video.videoHeight) {
      return null;
    }

    const videoRect = video.getBoundingClientRect();
    const guideRect = guide.getBoundingClientRect();
    const sourceWidth = video.videoWidth;
    const sourceHeight = video.videoHeight;
    const sourceAspect = sourceWidth / sourceHeight;
    const viewAspect = videoRect.width / videoRect.height;

    let scale = 1;
    let offsetX = 0;
    let offsetY = 0;

    if (sourceAspect > viewAspect) {
      scale = videoRect.height / sourceHeight;
      const renderedWidth = sourceWidth * scale;
      offsetX = (renderedWidth - videoRect.width) / 2;
    } else {
      scale = videoRect.width / sourceWidth;
      const renderedHeight = sourceHeight * scale;
      offsetY = (renderedHeight - videoRect.height) / 2;
    }

    const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
    const sx = clamp((guideRect.left - videoRect.left + offsetX) / scale, 0, sourceWidth - 1);
    const sy = clamp((guideRect.top - videoRect.top + offsetY) / scale, 0, sourceHeight - 1);
    const sw = clamp(guideRect.width / scale, 1, Math.max(1, sourceWidth - sx));
    const sh = clamp(guideRect.height / scale, 1, Math.max(1, sourceHeight - sy));

    const maxOutputWidth = 1600;
    const outputScale = Math.min(1, maxOutputWidth / sw);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(sw * outputScale);
    canvas.height = Math.round(sh * outputScale);

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.92);
  };

  const handleCaptureWebcam = () => {
    const imageSrc = isDocumentMode
      ? cropDocumentFromVideo() || webcamRef.current?.getScreenshot()
      : webcamRef.current?.getScreenshot();

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

  const SelectedIcon = MODE_ICONS[selectedMode] || User;
  const isDocumentMode = selectedMode !== 'face';
  const guideClassName = isDocumentMode ? styles.cardGuide : styles.faceGuide;

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
            const IconComp = MODE_ICONS[m] || User;
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
        <button type="button" className={styles.captureButton} onClick={() => setShowWebcamModal(true)}>
          <Camera size={22} color="#FFFFFF" />
          <span>{capturedUri ? 'Retake with Camera' : 'Open Camera'}</span>
        </button>

        <button type="button" className={styles.galleryButton} onClick={() => fileInputRef.current?.click()}>
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
            type="button"
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
          <button
            type="button"
            className={styles.closeWebcamBtn}
            onClick={() => setShowWebcamModal(false)}
            aria-label="Close camera"
          >
            <X size={24} color="#FFFFFF" />
          </button>

          <div className={styles.webcamHeader}>
            <span className={styles.webcamTitle}>{MODE_LABELS[selectedMode]}</span>
            <span className={styles.webcamHint}>{GUIDE_LABELS[selectedMode]}</span>
          </div>

          <Webcam
            audio={false}
            ref={webcamRef}
            screenshotFormat="image/jpeg"
            videoConstraints={{ facingMode: selectedMode === 'face' ? 'user' : 'environment' }}
            className={styles.webcamView}
          />

          <div className={styles.scanOverlay} aria-hidden="true">
            <div ref={guideRef} className={guideClassName}>
              <span className={`${styles.corner} ${styles.cornerTopLeft}`} />
              <span className={`${styles.corner} ${styles.cornerTopRight}`} />
              <span className={`${styles.corner} ${styles.cornerBottomLeft}`} />
              <span className={`${styles.corner} ${styles.cornerBottomRight}`} />
            </div>
          </div>

          <div className={styles.snapBtnWrap}>
            <button
              type="button"
              className={styles.snapBtn}
              onClick={handleCaptureWebcam}
              aria-label="Capture scan image"
            >
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
